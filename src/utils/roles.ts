import { CompanyMembershipRole } from '@/types/domain';

/** The shape both `Membership` and an employee's client entry share. */
interface RoleBearing {
  roles?: CompanyMembershipRole[];
  /** Nullable because the responsibility matrix sends `null` for no role. */
  role?: CompanyMembershipRole | null;
}

/**
 * Every role a membership carries.
 *
 * The API returns `roles` and a deprecated `role` that always equals
 * `roles[0]`. Reading through here rather than either field directly means a
 * response from before `roles` shipped — or demo data, or a cached payload —
 * still yields a usable list instead of an empty one.
 */
export function membershipRoles(membership: RoleBearing | null | undefined): CompanyMembershipRole[] {
  if (!membership) return [];
  if (membership.roles?.length) return membership.roles;
  return membership.role ? [membership.role] : [];
}

/** "Designer · Copywriter" — every role, in the order the API returned them. */
export function rolesLabel(membership: RoleBearing | null | undefined): string {
  const roles = membershipRoles(membership);
  if (!roles.length) return '—';
  return roles.map(humanizeRole).join(' · ');
}

/** `SOCIAL_MEDIA_MANAGER` → `Social media manager`. */
export function humanizeRole(role: CompanyMembershipRole): string {
  const spaced = role.toLowerCase().split('_').join(' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Roles held by the agency's own staff, and the two that belong to the
 * client's own people.
 *
 * Split because mixing "our team" and "their people" in one picker makes it
 * easy to hand an external reviewer an internal role by accident.
 */
export const AGENCY_ROLES: CompanyMembershipRole[] = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
];

export const CLIENT_SIDE_ROLES: CompanyMembershipRole[] = [
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
];
