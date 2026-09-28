import { describe, expect, it } from 'vitest';
import { CompanyMembershipRole, type AttachmentEntityType } from '@/types/domain';
import { canAddAttachment, canRemoveAttachment, hasPermission, type Permission } from './permissions';

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
  'assets:upload':  '✓   ✓   ✓   ✓   .   .   ✓',
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

  it('attachment add rules follow the roles that edit each parent', () => {
    const table: Record<AttachmentEntityType, string> = {
      //               AM  SMM CW  DES CO  CR  SA
      TASK:          '✓   ✓   ✓   ✓   .   .   ✓',
      POST:          '✓   ✓   ✓   ✓   .   .   .',
      LEAD:          '✓   .   .   .   .   .   ✓',
      CAMPAIGN:      '✓   ✓   .   .   .   .   .',
      BRAND_PROFILE: '✓   .   .   ✓   .   .   .',
    };
    (Object.entries(table) as Array<[AttachmentEntityType, string]>).forEach(([entityType, row]) => {
      const cells = row.trim().split(/\s+/);
      ROLES.forEach((role, index) => {
        expect(canAddAttachment([role], entityType, false), `${role} → ${entityType}`).toBe(cells[index] === '✓');
      });
      expect(canAddAttachment([R.CLIENT_OWNER], entityType, true)).toBe(true);
    });
  });

  it('removal: the uploader, an Account Manager, or an admin', () => {
    expect(canRemoveAttachment([R.DESIGNER], 'u1', 'u1', false)).toBe(true);
    expect(canRemoveAttachment([R.DESIGNER], 'u1', 'u2', false)).toBe(false);
    expect(canRemoveAttachment([R.ACCOUNT_MANAGER], 'u1', 'u2', false)).toBe(true);
    expect(canRemoveAttachment([], 'u1', 'u2', true)).toBe(true);
  });

  it('only the Account Manager re-routes an approver', () => {
    ROLES.forEach((role) => {
      expect(hasPermission([role], 'tasks:approver')).toBe(role === R.ACCOUNT_MANAGER);
    });
  });
});
