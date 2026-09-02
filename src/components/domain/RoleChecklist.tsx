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
 *
 * Selection keeps click order: the API preserves the order it is sent and
 * reports the first entry as the person's main role, so the first box ticked
 * is the one that becomes it.
 */
export function RoleChecklist({
  value,
  onChange,
  disabled = false,
  includeClientRoles = true,
  available,
}: {
  value: CompanyMembershipRole[];
  onChange: (roles: CompanyMembershipRole[]) => void;
  disabled?: boolean;
  includeClientRoles?: boolean;
  /** Narrows what can be picked — invitations accept only a subset. */
  available?: readonly CompanyMembershipRole[];
}) {
  const name = useId();

  /*
    Appends rather than re-sorting: the API keeps the order it is given and
    treats the first entry as the main role, so ticking Designer then Copywriter
    makes them a Designer who also writes, and the reverse makes them a
    Copywriter who also designs.
  */
  const toggle = (role: CompanyMembershipRole) => {
    onChange(value.includes(role) ? value.filter((held) => held !== role) : [...value, role]);
  };

  const group = (label: string, roles: CompanyMembershipRole[]) => {
    const offered = available ? roles.filter((role) => available.includes(role)) : roles;
    if (!offered.length) return null;
    return (
    <fieldset className="role-checklist__group" disabled={disabled}>
      <legend>{label}</legend>
      {offered.map((role) => (
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
  };

  return (
    <div className="role-checklist">
      <div className="role-checklist__groups">
        {group('Agency team', AGENCY_ROLES)}
        {includeClientRoles ? group("The client's own people", CLIENT_SIDE_ROLES) : null}
      </div>
      {/* The main-role rule is invisible otherwise — nothing on screen says
          which of two ticked boxes the API will treat as primary. */}
      {value.length > 1 ? (
        <p className="role-checklist__hint">
          Main role: <strong>{humanizeRole(value[0])}</strong>. Untick and re-tick to change it.
        </p>
      ) : null}
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
