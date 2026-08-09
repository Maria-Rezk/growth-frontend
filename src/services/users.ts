import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoEmployees, makeId } from '@/services/demoStore';
import type { CreateEmployeePayload, Employee, UpdateEmployeePayload } from '@/types/domain';

export const usersService = {
  async list(): Promise<Employee[]> {
    if (env.demoMode) return demoDelay(demoEmployees);
    const response = await http.get(apiRoutes.users.list);
    return unwrap<Employee[]>(response.data);
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
};
