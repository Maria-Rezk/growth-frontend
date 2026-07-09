import { CompanyMembershipRole, type Membership } from '@/types/domain';

export type Permission =
  | 'posts:create'
  | 'posts:edit'
  | 'posts:submit'
  | 'posts:approve'
  | 'posts:publish'
  | 'assets:upload'
  | 'leads:manage'
  | 'tasks:manage'
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

export function hasPermission(role: CompanyMembershipRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getActiveRole(memberships: Membership[] | undefined, companyId: string | null): CompanyMembershipRole | undefined {
  if (!companyId) return undefined;
  return memberships?.find((membership) => membership.companyId === companyId && membership.status === 'ACTIVE')?.role;
}

export function roleLabel(role?: CompanyMembershipRole): string {
  if (!role) return 'No active role';
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
