import { describe, expect, it } from 'vitest';
import { CompanyMembershipRole, type Membership } from '@/types/domain';
import { isClientSideOnly, membershipRoles, rolesLabel } from '@/utils/roles';
import { getActiveRoles, hasPermission } from '@/utils/permissions';

function membership(partial: Partial<Membership>): Membership {
  return {
    id: 'm1',
    companyId: 'c1',
    userId: 'u1',
    roles: [],
    status: 'ACTIVE',
    ...partial,
  } as Membership;
}

describe('membershipRoles', () => {
  it('reads the roles array', () => {
    const held = membershipRoles(membership({ roles: ['DESIGNER', 'COPYWRITER'] }));
    expect(held).toEqual(['DESIGNER', 'COPYWRITER']);
  });

  it('falls back to the deprecated single role', () => {
    // A response from before `roles` shipped must still yield a usable list,
    // not an empty one that silently removes every permission.
    expect(membershipRoles({ role: 'DESIGNER' })).toEqual(['DESIGNER']);
  });

  it('prefers roles when both are present, as the API sends them', () => {
    expect(membershipRoles({ roles: ['COPYWRITER', 'DESIGNER'], role: 'COPYWRITER' }))
      .toEqual(['COPYWRITER', 'DESIGNER']);
  });

  it('is empty for a membership with neither, and for nothing at all', () => {
    expect(membershipRoles({})).toEqual([]);
    expect(membershipRoles(undefined)).toEqual([]);
    expect(membershipRoles(null)).toEqual([]);
  });

  it('tolerates the matrix sending a null role', () => {
    expect(membershipRoles({ role: null })).toEqual([]);
  });
});

describe('rolesLabel', () => {
  it('joins every role, humanised', () => {
    expect(rolesLabel({ roles: ['DESIGNER', 'SOCIAL_MEDIA_MANAGER'] }))
      .toBe('Designer · Social media manager');
  });

  it('marks no roles rather than rendering an empty string', () => {
    expect(rolesLabel({ roles: [] })).toBe('—');
  });
});

describe('hasPermission', () => {
  it('passes when any held role allows it', () => {
    // Designer cannot approve posts; Client owner can. Holding both is enough —
    // this is the check that a second hat silently broke before.
    const roles = [CompanyMembershipRole.DESIGNER, CompanyMembershipRole.CLIENT_OWNER];
    expect(hasPermission(roles, 'posts:approve')).toBe(true);
  });

  it('fails when no held role allows it', () => {
    expect(hasPermission([CompanyMembershipRole.DESIGNER], 'posts:approve')).toBe(false);
  });

  it('grants the union, not the intersection', () => {
    const roles = [CompanyMembershipRole.DESIGNER, CompanyMembershipRole.SALES_AGENT];
    expect(hasPermission(roles, 'posts:edit')).toBe(true); // Designer only
    expect(hasPermission(roles, 'leads:manage')).toBe(true); // Sales agent only
  });

  it('fails on an empty or missing set', () => {
    expect(hasPermission([], 'reports:view')).toBe(false);
    expect(hasPermission(undefined, 'reports:view')).toBe(false);
  });
});

describe('getActiveRoles', () => {
  const memberships: Membership[] = [
    membership({ id: 'm1', companyId: 'c1', roles: ['DESIGNER', 'ACCOUNT_MANAGER'] }),
    membership({ id: 'm2', companyId: 'c2', roles: ['SALES_AGENT'] }),
    membership({ id: 'm3', companyId: 'c3', roles: ['COPYWRITER'], status: 'SUSPENDED' }),
  ];

  it('returns every role held on that client', () => {
    expect(getActiveRoles(memberships, 'c1')).toEqual(['DESIGNER', 'ACCOUNT_MANAGER']);
  });

  it('ignores suspended memberships', () => {
    expect(getActiveRoles(memberships, 'c3')).toEqual([]);
  });

  it('is empty with no client selected or no memberships', () => {
    expect(getActiveRoles(memberships, null)).toEqual([]);
    expect(getActiveRoles(undefined, 'c1')).toEqual([]);
  });
});

describe('isClientSideOnly', () => {
  it('is true only when every held role is client-side', () => {
    expect(isClientSideOnly([CompanyMembershipRole.CLIENT_OWNER])).toBe(true);
    expect(isClientSideOnly([CompanyMembershipRole.CLIENT_OWNER, CompanyMembershipRole.CLIENT_REVIEWER])).toBe(true);
  });

  it('treats anyone with an agency role as staff, whatever else they hold', () => {
    expect(isClientSideOnly([CompanyMembershipRole.CLIENT_OWNER, CompanyMembershipRole.DESIGNER])).toBe(false);
    expect(isClientSideOnly([CompanyMembershipRole.ACCOUNT_MANAGER])).toBe(false);
  });

  it('is false for no roles — that is "not set up", not a client', () => {
    expect(isClientSideOnly([])).toBe(false);
  });
});
