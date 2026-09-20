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
 * membership says. `ready` is false while memberships are still loading, so
 * a route guard can wait rather than bounce somebody on a half-loaded state.
 */
export function useClientView(): { isClient: boolean; ready: boolean } {
  const { user } = useAuth();
  const { currentMembership, loading, activeCompanyId } = useCompany();

  return useMemo(() => {
    if (isPlatformAdmin(user?.platformRole)) return { isClient: false, ready: true };
    const ready = !loading && Boolean(activeCompanyId);
    return { isClient: ready && isClientSideOnly(membershipRoles(currentMembership)), ready };
  }, [activeCompanyId, currentMembership, loading, user?.platformRole]);
}
