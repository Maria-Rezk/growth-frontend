import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, isRouteMissing, notShippedError, unwrap } from '@/lib/http';
import { getAllItems } from '@/lib/paging';
import { demoDelay, demoEmployees, makeId } from '@/services/demoStore';
import type { CreateEmployeePayload, Employee, PlatformRole, UpdateEmployeePayload, UserType } from '@/types/domain';

/** Which people `GET /users` returns. `all` is the unfiltered list: staff and client contacts together. */
export type UserListType = 'employees' | 'clients' | 'all';

const TYPE_FOR: Record<Exclude<UserListType, 'all'>, UserType> = { employees: 'EMPLOYEE', clients: 'CLIENT' };
import { sortByName } from '@/utils/sort';

export const usersService = {
  /**
   * People A→Z by the name the UI shows them under — full name when there is
   * one, email otherwise, so a person without a name still lands in order
   * rather than at the end of the list.
   *
   * Staff only by default (`?type=employees`): without it the API also returns
   * every invited client contact, who do not belong on the Employees page or
   * in an employee picker.
   */
  async list(type: UserListType = 'employees'): Promise<Employee[]> {
    const order = (employee: Employee) => employee.fullName ?? employee.email;
    if (env.demoMode) {
      // A demo user without `userType` is staff, like every seeded employee.
      const rows = type === 'all' ? demoEmployees : demoEmployees.filter((employee) => (employee.userType ?? 'EMPLOYEE') === TYPE_FOR[type]);
      return demoDelay(sortByName(rows, order));
    }
    return sortByName(await getAllItems<Employee>(apiRoutes.users.list, type === 'all' ? undefined : { type }), order);
  },
  async create(payload: CreateEmployeePayload): Promise<Employee> {
    if (env.demoMode) {
      const employee: Employee = {
        id: makeId('user'),
        email: payload.email,
        fullName: payload.fullName,
        platformRole: payload.platformRole ?? 'USER',
        status: 'ACTIVE',
        userType: 'EMPLOYEE',
        createdAt: new Date().toISOString(),
        clients: [],
      };
      demoEmployees.push(employee);
      return demoDelay(employee);
    }
    const response = await http.post(apiRoutes.users.create, payload);
    return unwrap<Employee>(response.data);
  },
  async detail(userId: string): Promise<Employee> {
    if (env.demoMode) {
      const employee = demoEmployees.find((item) => item.id === userId);
      if (!employee) throw new Error('Employee not found.');
      return demoDelay(employee);
    }
    const response = await http.get(apiRoutes.users.detail(userId));
    return unwrap<Employee>(response.data);
  },
  /**
   * Name, status and admin-performed password reset.
   *
   * `UpdateEmployeePayload` has no `platformRole` on purpose — it moved to
   * `updatePlatformRole` below. Because the API rejects unknown body fields,
   * slipping it back in here is a 400 for the whole request.
   */
  async update(userId: string, payload: UpdateEmployeePayload): Promise<Employee> {
    if (env.demoMode) {
      const employee = demoEmployees.find((item) => item.id === userId);
      if (!employee) throw new Error('Employee not found.');
      Object.assign(employee, payload);
      return demoDelay(employee);
    }
    const response = await http.patch(apiRoutes.users.update(userId), payload);
    return unwrap<Employee>(response.data);
  },
  /**
   * Assigns a platform role. Super Admin only — an Admin gets 403.
   *
   * The server also guards two cases worth distinct copy: a Super Admin
   * demoting themselves, and demoting the last Super Admin. Both come back as
   * 400/409 with a message; surface it rather than a generic failure.
   *
   * The new role reaches the target user only when their token is re-issued,
   * so expect a window where their UI still shows the old capabilities.
   */
  async updatePlatformRole(userId: string, platformRole: PlatformRole): Promise<Employee> {
    if (env.demoMode) {
      const employee = demoEmployees.find((item) => item.id === userId);
      if (!employee) throw new Error('Employee not found.');
      employee.platformRole = platformRole;
      return demoDelay(employee);
    }
    try {
      const response = await http.patch(apiRoutes.users.platformRole(userId), { platformRole });
      return unwrap<Employee>(response.data);
    } catch (error) {
      // SPEC endpoint. Until it ships, say so plainly rather than surfacing
      // the router's "Cannot PATCH /api/users/…/platform-role".
      if (isRouteMissing(error)) {
        throw notShippedError(error, 'Changing a platform role has not shipped on this backend yet. The role is unchanged.');
      }
      throw error;
    }
  },
};
