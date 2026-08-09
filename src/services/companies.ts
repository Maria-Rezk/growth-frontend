import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoCompany, demoDelay, demoEmployees, demoMemberships, makeId } from '@/services/demoStore';
import type { Company, Membership, CompanyMembershipRole, MembershipStatus } from '@/types/domain';

export const companiesService = {
  async list(): Promise<Company[]> {
    if (env.demoMode) return demoDelay([demoCompany]);
    const response = await http.get(apiRoutes.companies.list);
    return unwrap<Company[]>(response.data);
  },
  async create(payload: { name: string }): Promise<Company> {
    if (env.demoMode) return demoDelay({ id: makeId('company'), name: payload.name, createdAt: new Date().toISOString() });
    const response = await http.post(apiRoutes.companies.create, payload);
    return unwrap<Company>(response.data);
  },
  async members(companyId: string): Promise<Membership[]> {
    if (env.demoMode) return demoDelay(demoMemberships.filter((membership) => membership.companyId === companyId));
    const response = await http.get(apiRoutes.companies.members(companyId));
    return unwrap<Membership[]>(response.data);
  },
  async updateMember(
    companyId: string,
    membershipId: string,
    payload: { role?: CompanyMembershipRole; status?: MembershipStatus },
  ): Promise<Membership> {
    if (env.demoMode) {
      const member = demoMemberships.find((item) => item.id === membershipId && item.companyId === companyId);
      if (!member) throw new Error('Member not found.');
      Object.assign(member, payload);
      return demoDelay(member);
    }
    const response = await http.patch(apiRoutes.companies.member(companyId, membershipId), payload);
    return unwrap<Membership>(response.data);
  },
  async removeMember(companyId: string, membershipId: string): Promise<void> {
    if (env.demoMode) return demoDelay(undefined);
    await http.delete(apiRoutes.companies.member(companyId, membershipId));
  },
  async addMember(companyId: string, payload: { userId: string; role: CompanyMembershipRole }): Promise<Membership> {
    if (env.demoMode) {
      const membership: Membership = {
        id: makeId('membership'),
        companyId,
        userId: payload.userId,
        role: payload.role,
        status: 'ACTIVE',
      };
      demoMemberships.push(membership);
      const employee = demoEmployees.find((item) => item.id === payload.userId);
      if (employee) {
        employee.clients.push({ membershipId: membership.id, companyId, companyName: demoCompany.name, role: payload.role });
      }
      return demoDelay(membership);
    }
    const response = await http.post(apiRoutes.companies.members(companyId), payload);
    return unwrap<Membership>(response.data);
  },
};
