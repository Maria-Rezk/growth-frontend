import type { CompanyMembershipRole, Membership } from '@/types/domain';
import { membershipRoles } from '@/utils/roles';

/*
  Options are keyed by person *and* role so the same person can appear under
  each role they hold. A plain userId would repeat across options, and a select
  resolves a repeated value to the first match — pick Naya under Account
  manager and the field would snap back to showing her under Copywriter.
*/
const SEPARATOR = '::';

/** The option value to submit for a person found under a given role. */
export function assigneeOptionValue(userId: string, role: CompanyMembershipRole | 'none'): string {
  return `${userId}${SEPARATOR}${role}`;
}

/** The user id inside an option value. Assignment is per person, not per role. */
export function assigneeUserId(optionValue: string): string {
  return optionValue.split(SEPARATOR)[0] ?? '';
}

/**
 * The option value that should read as selected for an assigned user.
 *
 * A person holding three roles has three options; the first is the one shown,
 * which is their main role — the same entry the API reports as `roles[0]`.
 */
export function assigneeValueFor(members: Membership[], userId: string | null | undefined): string {
  if (!userId) return '';
  const member = members.find((item) => item.userId === userId);
  if (!member) return '';
  const [first] = membershipRoles(member);
  return assigneeOptionValue(userId, first ?? 'none');
}
