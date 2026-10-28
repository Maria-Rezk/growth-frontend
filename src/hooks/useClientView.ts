import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { isPlatformAdmin } from '@/types/domain';
import { isClientSideOnly, membershipRoles } from '@/utils/roles';

/**
 * Is the signed-in person a client on the active workspace?
 *
 * Decides between the client portal (Home, content, plans, brand, reports)
 * and the agency app. Platform admins are never clients, whatever their
 * membership says.
 *
 * `ready` is false only while the clients and memberships are still loading,
 * so a route guard can wait rather than bounce somebody on a half-loaded
 * state. It used to also require an active client, which meant a person with
 * no client was never "ready": the landing page stayed blank and the agency
 * guard rendered its page for them. `hasCompany` now says that separately.
 */
export function useClientView(): { isClient: boolean; ready: boolean; hasCompany: boolean } {
  const { user } = useAuth();
  const { currentMembership, loading, activeCompanyId } = useCompany();

  return useMemo(() => {
    const hasCompany = Boolean(activeCompanyId);
    if (isPlatformAdmin(user?.platformRole)) return { isClient: false, ready: true, hasCompany };
    const ready = !loading;
    return { isClient: ready && hasCompany && isClientSideOnly(membershipRoles(currentMembership)), ready, hasCompany };
  }, [activeCompanyId, currentMembership, loading, user?.platformRole]);
}
