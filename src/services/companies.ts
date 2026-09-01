import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, isRouteMissing, notShippedError, unwrap } from '@/lib/http';
import { demoCompany, demoDelay, demoEmployees, demoMemberships, makeId } from '@/services/demoStore';
import type {
  ApiErrorShape,
  Company,
  CompanyStatus,
  CompanyMembershipRole,
  DeleteClientResult,
  Membership,
  MembershipStatus,
} from '@/types/domain';
import { sortByName } from '@/utils/sort';

/**
 * Fields `POST /companies` accepts. `name` is the only required one; the rest
 * can be filled in later from the client's settings.
 *
 * `website` must carry a protocol — the API 400s on a bare domain, so the
 * create form prefixes `https://` before it gets here.
 */
export interface CreateCompanyPayload {
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  city?: string;
  country?: string;
}

/**
 * Fields `PATCH /companies/:companyId` accepts.
 *
 * Send only the keys being changed — unknown or extra properties are rejected
 * outright (400), not ignored. Renaming is `{ name }` alone; archiving is
 * `{ status: 'ARCHIVED' }` alone.
 */
export interface UpdateCompanyPayload {
  name?: string;
  status?: CompanyStatus;
  industry?: string;
  website?: string;
  phone?: string;
  city?: string;
  country?: string;
}

export const companiesService = {
  /** Clients A→Z by name — the API returns them in insertion order. */
  async list(): Promise<Company[]> {
    if (env.demoMode) return demoDelay([demoCompany]);
    const response = await http.get(apiRoutes.companies.list);
    return sortByName(unwrap<Company[]>(response.data), (company) => company.name);
  },
  async create(payload: CreateCompanyPayload): Promise<Company> {
    if (env.demoMode) return demoDelay({ id: makeId('company'), name: payload.name, createdAt: new Date().toISOString() });
    /*
      The creator is added to the new client as ACCOUNT_MANAGER server-side.
      Do not follow this with an addMember call for them — that is a duplicate
      membership error, not a no-op.
    */
    const response = await http.post(apiRoutes.companies.create, payload);
    return unwrap<Company>(response.data);
  },
  /**
   * Rename or archive a client.
   *
   * The permission on this route is tightening from "any member of the client"
   * to "Admin or Super Admin", which is why the control lives in the admin
   * area rather than the client workspace — see ClientsPage.
   */
  async update(companyId: string, payload: UpdateCompanyPayload): Promise<Company> {
    if (env.demoMode) {
      Object.assign(demoCompany, payload);
      return demoDelay(demoCompany);
    }
    const response = await http.patch(apiRoutes.companies.detail(companyId), payload);
    return unwrap<Company>(response.data);
  },
  /**
   * Permanently deletes a client and everything under it. Super Admin only.
   *
   * `confirmName` must equal the client's exact name; the API answers 409 and
   * deletes nothing otherwise.
   *
   * Two kinds of 404 have to be told apart here, and getting it wrong is worse
   * than any other mistake on this screen:
   *
   *  - a *record* 404 means someone else already deleted the client. The end
   *    state is what the user wanted, so it resolves to `null` and the caller
   *    reports success and refreshes.
   *  - a *route* 404 means this endpoint has not shipped. Nothing was deleted,
   *    and reporting success would tell a Super Admin their client and all its
   *    data are gone while it sits untouched on the server.
   *
   * A 404 that did not come from the API at all (an offline tunnel answering
   * with an HTML page) throws for the same reason.
   */
  async remove(companyId: string, confirmName: string): Promise<DeleteClientResult | null> {
    if (env.demoMode) throw new Error('Deleting a client is disabled in demo mode.');
    try {
      const response = await http.delete(apiRoutes.companies.detail(companyId), {
        params: { confirm: confirmName },
      });
      return unwrap<DeleteClientResult>(response.data);
    } catch (error) {
      if (isRouteMissing(error)) {
        throw notShippedError(
          error,
          'Permanent delete has not shipped on this backend yet, so nothing was deleted. Archive the client instead — that is available now, and reversible.',
        );
      }
      const apiError = error as ApiErrorShape | undefined;
      if (apiError?.statusCode === 404 && apiError.isApiResponse) return null;
      throw error;
    }
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
