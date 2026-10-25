import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoMemberships } from '@/services/demoStore';
import { membershipRoles } from '@/utils/roles';
import type { MyMembershipWire, SessionMembership } from '@/types/domain';

/** One row, either as the endpoint sends it (`membershipId`) or as the older envelope did (`id`). */
function toSessionMembership(row: unknown): SessionMembership {
  if (!row || typeof row !== 'object') throw new Error('Unexpected membership row.');
  const wire = row as Partial<MyMembershipWire> & { id?: string; role?: SessionMembership['roles'][number] };
  const id = wire.membershipId ?? wire.id;
  if (!id || !wire.companyId) throw new Error('Unexpected membership row.');
  return {
    id,
    companyId: wire.companyId,
    // Always an array on the current API; `membershipRoles` covers a row that predates it.
    roles: membershipRoles(wire),
    status: wire.status ?? 'ACTIVE',
    ...(wire.company ? { company: wire.company } : {}),
    ...(wire.createdAt ? { createdAt: wire.createdAt } : {}),
  };
}

/**
 * Reads `GET /me/memberships`: a bare array, newest first. The older
 * `{ memberships: [...] }` envelope is still accepted. Anything else is an
 * error rather than an empty list: "I could not tell what you may do" must
 * never read as "you may do nothing and belong nowhere", because the first
 * deserves a retry and a notice.
 */
export function parseMyMemberships(body: unknown): SessionMembership[] {
  // `unwrap` strips a `{ data: [...] }` envelope, if a proxy or interceptor adds one.
  const data = unwrap<unknown>(body as never);
  const raw = Array.isArray(data) ? data : (data as { memberships?: unknown } | null)?.memberships;
  if (!Array.isArray(raw)) {
    throw new Error('Unexpected response from the memberships endpoint.');
  }
  return raw.map(toSessionMembership);
}

export const membershipsService = {
  /** The signed-in person's own ACTIVE memberships, with their effective roles. */
  async mine(): Promise<SessionMembership[]> {
    if (env.demoMode) {
      return demoDelay(
        demoMemberships.map((membership) => ({
          id: membership.id,
          companyId: membership.companyId,
          roles: membershipRoles(membership),
          status: membership.status,
          company: membership.company ? { id: membership.company.id, name: membership.company.name, status: membership.company.status } : undefined,
        })),
      );
    }
    const response = await http.get(apiRoutes.me.memberships);
    return parseMyMemberships(response.data);
  },
};
