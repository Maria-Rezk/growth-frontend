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
  'posts:create':   '✓   ✓   .   .   .   .   .',
  'posts:edit':     '✓   ✓   .   .   .   .   .',
  'posts:history':  '✓   ✓   .   .   .   .   .',
  'posts:submit':   '✓   ✓   .   .   .   .   .',
  'posts:approve':  '✓   .   .   .   ✓   ✓   .',
  'posts:publish':  '✓   ✓   .   .   .   .   .',
  'assets:upload':  '✓   ✓   ✓   ✓   .   .   ✓',
  'leads:manage':   '✓   .   .   .   .   .   ✓',
  'tasks:manage':   '✓   ✓   ✓   ✓   .   .   ✓',
  'tasks:approver': '✓   ✓   .   .   .   .   .',
  'tasks:edit':     '✓   ✓   .   .   .   .   .',
  'campaigns:manage': '✓   ✓   .   .   .   .   .',
  'members:manage': '✓   .   .   .   .   .   .',
  'members:administer': '.   .   .   .   .   .   .',
  'responsibilities:manage': '✓   .   .   .   .   .   .',
  'plans:manage':   '✓   ✓   .   .   .   .   .',
  'postAssets:manage': '✓   ✓   .   ✓   .   .   .',
  'automations:manage': '✓   .   .   .   .   .   .',
  'reports:view':   '✓   .   .   .   ✓   .   .',
  'reports:list':   '✓   .   .   .   .   .   .',
  'reports:generate': '✓   .   .   .   .   .   .',
  'reports:share':  '✓   .   .   .   .   .   .',
  'ai:generate':    '✓   ✓   ✓   .   .   .   .',
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

  it('only the Account Manager and Social Media Manager re-route an approver', () => {
    ROLES.forEach((role) => {
      expect(hasPermission([role], 'tasks:approver')).toBe(role === R.ACCOUNT_MANAGER || role === R.SOCIAL_MEDIA_MANAGER);
    });
  });
});

describe('ART_DIRECTOR (backend: TASK_ASSIGN_ROLES and design roles)', () => {
  it('can do what a Designer does, plus create, assign and re-route tasks', () => {
    for (const permission of ['postAssets:manage', 'tasks:manage', 'tasks:edit', 'tasks:approver'] as const) {
      expect(hasPermission([R.ART_DIRECTOR], permission)).toBe(true);
    }
  });

  it('cannot do what the backend reserves for others', () => {
    for (const permission of ['posts:create', 'posts:approve', 'campaigns:manage', 'responsibilities:manage', 'members:manage'] as const) {
      expect(hasPermission([R.ART_DIRECTOR], permission)).toBe(false);
    }
  });
});

