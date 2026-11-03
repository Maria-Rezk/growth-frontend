import { Fragment } from 'react';
import type { Membership } from '@/types/domain';
import { assigneeOptionValue } from '@/utils/assigneeOptions';
import { AGENCY_ROLES, CLIENT_SIDE_ROLES, humanizeRole, membershipRoles } from '@/utils/roles';
import { compareNames } from '@/utils/sort';

const ROLE_ORDER = [...AGENCY_ROLES, ...CLIENT_SIDE_ROLES];

function memberName(member: Membership): string {
  return member.user?.fullName ?? member.user?.email ?? member.userId;
}

/**
 * Assignees for a client, grouped by role.
 *
 * Somebody who copywrites, runs social and manages the account appears under
 * all three headings rather than as one line naming every hat, because the
 * question being asked is "who can do this work", and that reads far better
 * browsed by role than as "Naya Alzawa · Copywriter · Social media manager ·
 * Account manager".
 *
 * Whichever entry is picked, the task or lead goes to the person: there is no
 * per-role assignment in the API.
 */
export function AssigneeOptions({
  members,
  unassignedLabel = 'Unassigned',
}: {
  members: Membership[];
  unassignedLabel?: string;
}) {
  const active = members.filter((member) => member.status === 'ACTIVE');

  const byRole = ROLE_ORDER.map((role) => ({
    role,
    members: active
      .filter((member) => membershipRoles(member).includes(role))
      .sort((left, right) => compareNames(memberName(left), memberName(right))),
  })).filter((group) => group.members.length > 0);

  // Somebody whose roles did not load still has to be assignable.
  const unroled = active
    .filter((member) => membershipRoles(member).length === 0)
    .sort((left, right) => compareNames(memberName(left), memberName(right)));

  return (
    <>
      <option value="">{unassignedLabel}</option>
      {byRole.map((group) => (
        <optgroup key={group.role} label={humanizeRole(group.role)}>
          {group.members.map((member) => (
            <option key={`${member.id}-${group.role}`} value={assigneeOptionValue(member.userId, group.role)}>
              {memberName(member)}
            </option>
          ))}
        </optgroup>
      ))}
      {unroled.length ? (
        <optgroup label="No role set">
          {unroled.map((member) => (
            <option key={member.id} value={assigneeOptionValue(member.userId, 'none')}>
              {memberName(member)}
            </option>
          ))}
        </optgroup>
      ) : (
        <Fragment />
      )}
    </>
  );
}
