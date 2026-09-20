import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { isPlatformAdmin } from '@/types/domain';
import { getActiveRoles, hasPermission } from '@/utils/permissions';

/**
 * The signed-in person as the review flow sees them.
 *
 * `isAdmin` is the platform role: an Agency Admin or Super Admin may submit,
 * approve and re-route on anybody's behalf, and the activity log records the
 * press under their own name. `canChangeApprover` is the "Omar is on holiday"
 * button — Account Manager on this client, or an admin.
 */
export function useTaskActor() {
  const { user } = useAuth();
  const { activeCompanyId, memberships } = useCompany();

  return useMemo(() => {
    const isAdmin = isPlatformAdmin(user?.platformRole);
    const roles = getActiveRoles(memberships, activeCompanyId);
    return {
      userId: user?.id ?? null,
      isAdmin,
      canChangeApprover: isAdmin || hasPermission(roles, 'tasks:approver'),
    };
  }, [activeCompanyId, memberships, user?.id, user?.platformRole]);
}
