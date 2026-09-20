import { describe, expect, it } from 'vitest';
import { CompanyMembershipRole } from '@/types/domain';
import { hasPermission, type Permission } from './permissions';

/*
  The matrix as a table, so a change to who-may-do-what is a visible diff
  here rather than a surprise in a RoleGate somewhere. Rows are permissions,
  columns are roles; ✓ means granted.
*/
const R = CompanyMembershipRole;
const ROLES = [R.ACCOUNT_MANAGER, R.SOCIAL_MEDIA_MANAGER, R.COPYWRITER, R.DESIGNER, R.CLIENT_OWNER, R.CLIENT_REVIEWER, R.SALES_AGENT] as const;

const MATRIX: Record<Permission, string> = {
  //                AM  SMM CW  DES CO  CR  SA
  'posts:create':   '✓   ✓   ✓   .   .   .   .',
  'posts:edit':     '✓   ✓   ✓   ✓   .   .   .',
  'posts:submit':   '✓   ✓   .   .   .   .   .',
  'posts:approve':  '✓   .   .   .   ✓   ✓   .',
  'posts:publish':  '✓   ✓   .   .   .   .   .',
  'assets:upload':  '✓   ✓   ✓   ✓   ✓   ✓   ✓',
  'leads:manage':   '✓   .   .   .   .   .   ✓',
  'tasks:manage':   '✓   ✓   ✓   ✓   .   .   ✓',
  'tasks:approver': '✓   .   .   .   .   .   .',
  'members:manage': '✓   .   .   .   .   .   .',
  'reports:view':   '✓   ✓   ✓   ✓   ✓   ✓   ✓',
  'brand:edit':     '✓   .   .   .   .   .   .',
};

describe('permission matrix', () => {
  (Object.entries(MATRIX) as Array<[Permission, string]>).forEach(([permission, row]) => {
    const cells = row.trim().split(/\s+/);
    it(`${permission}: ${row.trim()}`, () => {
      ROLES.forEach((role, index) => {
        expect(hasPermission([role], permission), `${role} → ${permission}`).toBe(cells[index] === '✓');
      });
    });
  });

  it('client-side roles never manage internal work', () => {
    [R.CLIENT_OWNER, R.CLIENT_REVIEWER].forEach((role) => {
      expect(hasPermission([role], 'tasks:manage')).toBe(false);
      expect(hasPermission([role], 'posts:create')).toBe(false);
      expect(hasPermission([role], 'members:manage')).toBe(false);
    });
  });

  it('only the Account Manager re-routes an approver', () => {
    ROLES.forEach((role) => {
      expect(hasPermission([role], 'tasks:approver')).toBe(role === R.ACCOUNT_MANAGER);
    });
  });
});
