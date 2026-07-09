import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoCompany, demoDelay, demoMemberships, makeId } from '@/services/demoStore';
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
};
