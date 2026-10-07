import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoMemberships } from '@/services/demoStore';
import { membershipRoles } from '@/utils/roles';
import type { SessionMembership } from '@/types/domain';

/**
 * Reads `{ memberships: [...] }`. Anything else is an error rather than an empty
 * list: "I could not tell what you may do" must never read as "you may do nothing
 * and belong nowhere", because the first deserves a retry and a notice.
 */
export function parseMyMemberships(body: unknown): SessionMembership[] {
  const raw = unwrap<unknown>(body as never) as { memberships?: unknown } | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.memberships)) {
    throw new Error('Unexpected response from the memberships endpoint.');
  }
  return raw.memberships as SessionMembership[];
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
        })),
      );
    }
    const response = await http.get(apiRoutes.me.memberships);
    return parseMyMemberships(response.data);
  },
};
