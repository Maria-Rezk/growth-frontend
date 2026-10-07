import { CompanyMembershipRole, type AttachmentEntityType, type Membership } from '@/types/domain';
import { CLIENT_SIDE_ROLES, membershipRoles } from '@/utils/roles';

export type Permission =
  /** Create and edit a post. Account Manager and Social Media Manager. */
  | 'posts:create'
  | 'posts:edit'
  /** Read a post's signed approval trail. Account Manager and Social Media Manager. */
  | 'posts:history'
  | 'posts:submit'
  | 'posts:approve'
  | 'posts:publish'
  | 'assets:upload'
  | 'leads:manage'
  /** Status changes and comments: every internal role. */
  | 'tasks:manage'
  /** Create a task, reassign it, set its stage. Account Manager and Social Media Manager. */
  | 'tasks:edit'
  /** Create and manage campaigns and what is attached to them. Account Manager and Social Media Manager. */
  | 'campaigns:manage'
  /** Name or change who approves a task. Account Manager and Social Media Manager. */
  | 'tasks:approver'
  | 'members:manage'
  /** The responsibility matrix and its areas. Account Manager only. */
  | 'responsibilities:manage'
  /** Edit a content plan. Account Manager and Social Media Manager. */
  | 'plans:manage'
  /** The deliverable files on a post. AM, Designer, Social Media Manager. */
  | 'postAssets:manage'
  /** Automation rules and their run history. Account Manager only. */
  | 'automations:manage'
  /** The live reports overview. Account Manager and Client Owner. */
  | 'reports:view'
  /** The list of generated reports and each report's detail. Account Manager only. */
  | 'reports:list'
  /** Generate a monthly report. Account Manager only. */
  | 'reports:generate'
  /** Mint, rotate or revoke a report's public link. Account Manager only. */
  | 'reports:share'
  /**
   * Edit the brand profile. PRODUCT POLICY, not an API rule: the API lets any
   * member of the client write it. Kept to Account Managers until the product
   * owner decides otherwise; viewing is open to every member.
   */
  | 'brand:edit'
  /**
   * Run AI generation and apply results. PRODUCT POLICY, not an API rule: the
   * API lets any member of the client. Kept to the roles that author content.
   */
  | 'ai:generate';

const ROLE_PERMISSIONS: Record<CompanyMembershipRole, Permission[]> = {
  [CompanyMembershipRole.ACCOUNT_MANAGER]: [
    'posts:create',
    'posts:edit',
    'posts:history',
    'posts:submit',
    'posts:approve',
    'posts:publish',
    'assets:upload',
    'leads:manage',
    'tasks:manage',
    'tasks:edit',
    'campaigns:manage',
    'tasks:approver',
    'members:manage',
    'responsibilities:manage',
    'plans:manage',
    'postAssets:manage',
    'automations:manage',
    'ai:generate',
    'reports:view',
    'reports:list',
    'reports:generate',
    'reports:share',
    'brand:edit',
  ],
  [CompanyMembershipRole.SOCIAL_MEDIA_MANAGER]: [
    'posts:create',
    'posts:edit',
    'posts:history',
    'posts:submit',
    'posts:publish',
    'assets:upload',
    'plans:manage',
    'postAssets:manage',
    'tasks:manage',
    'tasks:edit',
    'campaigns:manage',
    'tasks:approver',
    'ai:generate',
  ],
  /*
    `assets:upload` (the file upload itself) is every internal role. Client
    roles read attachments on posts; they never add them. Which parent a file
    may then be attached to is narrower — see `canAddAttachment`.
  */
  [CompanyMembershipRole.COPYWRITER]: ['assets:upload', 'tasks:manage', 'ai:generate'],
  [CompanyMembershipRole.DESIGNER]: ['assets:upload', 'postAssets:manage', 'tasks:manage'],
  [CompanyMembershipRole.CLIENT_OWNER]: ['posts:approve', 'reports:view'],
  [CompanyMembershipRole.CLIENT_REVIEWER]: ['posts:approve'],
  [CompanyMembershipRole.SALES_AGENT]: ['leads:manage', 'assets:upload', 'tasks:manage'],
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
