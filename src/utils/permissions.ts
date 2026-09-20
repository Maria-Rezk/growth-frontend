import { CompanyMembershipRole, type Membership } from '@/types/domain';
import { membershipRoles } from '@/utils/roles';

export type Permission =
  | 'posts:create'
  | 'posts:edit'
  | 'posts:submit'
  | 'posts:approve'
  | 'posts:publish'
  | 'assets:upload'
  | 'leads:manage'
  | 'tasks:manage'
  /** Name or change who approves a task. Account Manager (and platform admins, checked separately). */
  | 'tasks:approver'
  | 'members:manage'
  | 'reports:view'
  | 'brand:edit';

const ROLE_PERMISSIONS: Record<CompanyMembershipRole, Permission[]> = {
  [CompanyMembershipRole.ACCOUNT_MANAGER]: [
    'posts:create',
    'posts:edit',
    'posts:submit',
    'posts:approve',
    'posts:publish',
    'assets:upload',
    'leads:manage',
    'tasks:manage',
    'tasks:approver',
    'members:manage',
    'reports:view',
    'brand:edit',
  ],
  [CompanyMembershipRole.SOCIAL_MEDIA_MANAGER]: [
    'posts:create',
    'posts:edit',
    'posts:submit',
    'posts:publish',
    'assets:upload',
    'tasks:manage',
    'reports:view',
  ],
  [CompanyMembershipRole.COPYWRITER]: ['posts:create', 'posts:edit', 'tasks:manage', 'reports:view'],
  [CompanyMembershipRole.DESIGNER]: ['posts:edit', 'assets:upload', 'tasks:manage', 'reports:view'],
  [CompanyMembershipRole.CLIENT_OWNER]: ['posts:approve', 'reports:view'],
  [CompanyMembershipRole.CLIENT_REVIEWER]: ['posts:approve', 'reports:view'],
  [CompanyMembershipRole.SALES_AGENT]: ['leads:manage', 'tasks:manage', 'reports:view'],
};

/**
 * Any role wins: the check passes if at least one held role allows it, matching
 * how the API decides. Somebody who is Designer and Account Manager can do
 * everything either role can.
 */
export function hasPermission(roles: CompanyMembershipRole[] | undefined, permission: Permission): boolean {
  if (!roles?.length) return false;
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
}

/** Every role the signed-in user holds on `companyId`, via their membership. */
export function getActiveRoles(memberships: Membership[] | undefined, companyId: string | null): CompanyMembershipRole[] {
  if (!companyId) return [];
  const membership = memberships?.find((item) => item.companyId === companyId && item.status === 'ACTIVE');
  return membershipRoles(membership);
}

export function roleLabel(role?: CompanyMembershipRole): string {
  if (!role) return 'No active role';
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
