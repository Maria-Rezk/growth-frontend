import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { isPlatformAdmin, type CompanyMembershipRole } from '@/types/domain';
import { getActiveRoles, hasPermission, type Permission } from '@/utils/permissions';

/**
 * The signed-in person's roles on the ACTIVE client — empty when they have none,
 * when the membership is not active, or when their roles are unknown. The one
 * place session state becomes roles; everything else reads this.
 */
export function useActiveRoles(): CompanyMembershipRole[] {
  const { activeCompanyId, memberships } = useCompany();
  return getActiveRoles(memberships, activeCompanyId);
}

/**
 * May the signed-in person do this on the active client?
 *
 * The API lets both platform admins through every company check before it
 * looks at memberships, so this does the same: an admin who is not a member of
 * the client (the normal case when supporting one) still sees the controls the
 * API will accept. For everybody else it is the union of their roles on this
 * client. UX only — the API answers 403 to anything this lets through by mistake.
 */
export function useCan(): (permission: Permission) => boolean {
  const { user } = useAuth();
  const admin = isPlatformAdmin(user?.platformRole);
  const roles = useActiveRoles();
  return (permission) => admin || hasPermission(roles, permission);
}

export function usePermission(permission: Permission): boolean {
  return useCan()(permission);
}
