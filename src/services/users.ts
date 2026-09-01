import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, isRouteMissing, notShippedError, unwrap } from '@/lib/http';
import { demoDelay, demoEmployees, makeId } from '@/services/demoStore';
import type { CreateEmployeePayload, Employee, PlatformRole, UpdateEmployeePayload } from '@/types/domain';
import { sortByName } from '@/utils/sort';

export const usersService = {
  /**
   * Employees A→Z by the name the UI shows them under — full name when there is
   * one, email otherwise, so a person without a name still lands in order
   * rather than at the end of the list.
   */
  async list(): Promise<Employee[]> {
    const order = (employee: Employee) => employee.fullName ?? employee.email;
    if (env.demoMode) return demoDelay(sortByName(demoEmployees, order));
    const response = await http.get(apiRoutes.users.list);
    return sortByName(unwrap<Employee[]>(response.data), order);
  },
  async create(payload: CreateEmployeePayload): Promise<Employee> {
    if (env.demoMode) {
      const employee: Employee = {
        id: makeId('user'),
        email: payload.email,
        fullName: payload.fullName,
        platformRole: payload.platformRole ?? 'USER',
        status: 'ACTIVE',
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
