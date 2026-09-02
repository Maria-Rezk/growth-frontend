import { useId } from 'react';
import type { CompanyMembershipRole } from '@/types/domain';
import { AGENCY_ROLES, CLIENT_SIDE_ROLES, humanizeRole } from '@/utils/roles';

/**
 * Picks the roles somebody holds on one client.
 *
 * Checkboxes rather than a multi-select: there are seven roles, the set is
 * fixed, and a multi-select `<select>` hides what is chosen behind a scroll.
 *
 * The agency's own roles and the client's own people are kept in separate
 * groups — mixing "our staff" and "their reviewer" in one flat list makes it
 * easy to hand an external contact an internal role by accident.
 *
 * Saving replaces the whole set, so this always starts from what the person
 * already holds. The caller is responsible for blocking an empty set: the API
 * rejects it, and a member with no roles has no permissions.
 */
export function RoleChecklist({
  value,
  onChange,
  disabled = false,
  includeClientRoles = true,
}: {
  value: CompanyMembershipRole[];
  onChange: (roles: CompanyMembershipRole[]) => void;
  disabled?: boolean;
  includeClientRoles?: boolean;
}) {
  const name = useId();

  const toggle = (role: CompanyMembershipRole) => {
    // Order is preserved by the API and the first role is what the deprecated
    // `role` field reports, so keep the group order rather than append order.
    const next = value.includes(role) ? value.filter((held) => held !== role) : [...value, role];
    const ordered = [...AGENCY_ROLES, ...CLIENT_SIDE_ROLES].filter((item) => next.includes(item));
    onChange(ordered);
  };

  const group = (label: string, roles: CompanyMembershipRole[]) => (
    <fieldset className="role-checklist__group" disabled={disabled}>
      <legend>{label}</legend>
      {roles.map((role) => (
        <label key={role} className="role-checklist__option" htmlFor={`${name}-${role}`}>
          <input
            id={`${name}-${role}`}
            type="checkbox"
            checked={value.includes(role)}
            onChange={() => toggle(role)}
          />
          <span>{humanizeRole(role)}</span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="role-checklist">
      {group('Agency team', AGENCY_ROLES)}
      {includeClientRoles ? group("The client's own people", CLIENT_SIDE_ROLES) : null}
    </div>
  );
}

/** The roles someone holds, as pills — two hats should read as two hats. */
export function RolePills({ roles }: { roles: CompanyMembershipRole[] }) {
  if (!roles.length) return <span className="muted">No role</span>;
  return (
    <span className="role-pills">
      {roles.map((role) => <span key={role} className="role-pill">{humanizeRole(role)}</span>)}
    </span>
  );
}
