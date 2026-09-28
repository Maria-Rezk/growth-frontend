import { CompanyMembershipRole, type AttachmentEntityType, type Membership } from '@/types/domain';
import { CLIENT_SIDE_ROLES, membershipRoles } from '@/utils/roles';

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
  /*
    `assets:upload` (the file upload itself) is every internal role. Client
    roles read attachments on posts; they never add them. Which parent a file
    may then be attached to is narrower — see `canAddAttachment`.
  */
  [CompanyMembershipRole.COPYWRITER]: ['posts:create', 'posts:edit', 'assets:upload', 'tasks:manage', 'reports:view'],
  [CompanyMembershipRole.DESIGNER]: ['posts:edit', 'assets:upload', 'tasks:manage', 'reports:view'],
  [CompanyMembershipRole.CLIENT_OWNER]: ['posts:approve', 'reports:view'],
  [CompanyMembershipRole.CLIENT_REVIEWER]: ['posts:approve', 'reports:view'],
  [CompanyMembershipRole.SALES_AGENT]: ['leads:manage', 'assets:upload', 'tasks:manage', 'reports:view'],
};

const R = CompanyMembershipRole;

/** The roles that edit each parent, which are the roles that may attach to it. */
const ATTACH_ROLES: Record<AttachmentEntityType, CompanyMembershipRole[] | 'ANY_INTERNAL'> = {
  TASK: 'ANY_INTERNAL',
  POST: [R.ACCOUNT_MANAGER, R.SOCIAL_MEDIA_MANAGER, R.DESIGNER, R.COPYWRITER],
  LEAD: [R.ACCOUNT_MANAGER, R.SALES_AGENT],
  CAMPAIGN: [R.ACCOUNT_MANAGER, R.SOCIAL_MEDIA_MANAGER],
  BRAND_PROFILE: [R.ACCOUNT_MANAGER, R.DESIGNER],
};

/** Mirrors the API's add rule. Platform admins may attach anywhere. */
export function canAddAttachment(roles: CompanyMembershipRole[], entityType: AttachmentEntityType, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const allowed = ATTACH_ROLES[entityType];
  if (allowed === 'ANY_INTERNAL') return roles.some((role) => !CLIENT_SIDE_ROLES.includes(role));
  return roles.some((role) => allowed.includes(role));
}

/** Mirrors the API's delete rule: whoever attached it, an Account Manager on the client, or a platform admin. */
export function canRemoveAttachment(roles: CompanyMembershipRole[], uploadedById: string, userId: string | null, isAdmin: boolean): boolean {
  return isAdmin || (userId !== null && uploadedById === userId) || roles.includes(R.ACCOUNT_MANAGER);
}

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
