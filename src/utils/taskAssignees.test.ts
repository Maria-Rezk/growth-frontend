import { describe, expect, it } from 'vitest';
import type { TaskAssignee } from '@/types/domain';
import {
  TASK_ASSIGNEE_ROLES,
  duplicateAssigneeIndexes,
  isOnTask,
  readAssigneeChanges,
  sameAssignees,
  sortAssignees,
  suggestTaskRole,
  taskRoleLabel,
  taskRolesLabel,
} from './taskAssignees';

const row = (userId: string, role: TaskAssignee['role'], fullName = userId): TaskAssignee => ({
  id: `${userId}-${role}`,
  userId,
  role,
  user: { id: userId, email: `${userId}@x.test`, fullName },
});

describe('task roles', () => {
  it('are the seven the API accepts, CONTENT_CREATOR included', () => {
    expect(TASK_ASSIGNEE_ROLES).toEqual([
      'ACCOUNT_MANAGER', 'ART_DIRECTOR', 'DESIGNER', 'COPYWRITER', 'CONTENT_CREATOR', 'SOCIAL_MEDIA_MANAGER', 'SALES_AGENT',
    ]);
  });

  it('read in one language at a time', () => {
    expect(taskRoleLabel('CONTENT_CREATOR')).toBe('Content Creator');
    expect(taskRoleLabel('CONTENT_CREATOR', 'ar')).toBe('صانع المحتوى');
    expect(taskRoleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('name two roles the way the notification does', () => {
    expect(taskRolesLabel(['ART_DIRECTOR', 'DESIGNER'])).toBe('Art Director and Designer');
    expect(taskRolesLabel(['DESIGNER'])).toBe('Designer');
  });
});

describe('suggestTaskRole', () => {
  it('pre-picks the first company role that is also a task role', () => {
    expect(suggestTaskRole({ roles: ['DESIGNER', 'COPYWRITER'] })).toBe('DESIGNER');
    expect(suggestTaskRole({ roles: ['CLIENT_OWNER'] })).toBeUndefined();
  });

  it('skips a role the person already plays on the task', () => {
    expect(suggestTaskRole({ roles: ['DESIGNER', 'COPYWRITER'] }, new Set(['DESIGNER']))).toBe('COPYWRITER');
  });
});

describe('sortAssignees', () => {
  it('puts the lead first, then orders by role and name — the API does not', () => {
    const rows = [row('sara', 'CONTENT_CREATOR'), row('jessika', 'ACCOUNT_MANAGER'), row('yasin', 'DESIGNER')];
    expect(sortAssignees(rows, 'yasin').map((item) => item.userId)).toEqual(['yasin', 'jessika', 'sara']);
    expect(sortAssignees(rows).map((item) => item.userId)).toEqual(['jessika', 'yasin', 'sara']);
  });
});

describe('list rules', () => {
  it('flags the same person in the same role twice, not the same person in two roles', () => {
    expect(duplicateAssigneeIndexes([
      { userId: 'amr', role: 'ART_DIRECTOR' },
      { userId: 'amr', role: 'DESIGNER' },
      { userId: 'amr', role: 'DESIGNER' },
      { userId: '', role: '' },
    ])).toEqual([2]);
  });

  it('compares lists regardless of order', () => {
    const a = [{ userId: 'u1', role: 'DESIGNER' as const }, { userId: 'u2', role: 'COPYWRITER' as const }];
    expect(sameAssignees(a, [...a].reverse())).toBe(true);
    expect(sameAssignees(a, [a[0]])).toBe(false);
  });

  it('counts the lead and everybody on the list as on the task', () => {
    const task = { assignedToId: 'jessika', assignees: [row('yasin', 'DESIGNER')] };
    expect(isOnTask(task, 'jessika')).toBe(true);
    expect(isOnTask(task, 'yasin')).toBe(true);
    expect(isOnTask(task, 'omar')).toBe(false);
    expect(isOnTask(task, null)).toBe(false);
  });
});

describe('readAssigneeChanges', () => {
  it('reads ASSIGNEES_CHANGED metadata and drops malformed entries', () => {
    expect(readAssigneeChanges({
      added: [{ userId: 'omar', role: 'ART_DIRECTOR' }, { nope: true }],
      removed: [{ userId: 'sara', role: 'CONTENT_CREATOR' }],
    })).toEqual({
      added: [{ userId: 'omar', role: 'ART_DIRECTOR' }],
      removed: [{ userId: 'sara', role: 'CONTENT_CREATOR' }],
    });
    expect(readAssigneeChanges(undefined)).toEqual({ added: [], removed: [] });
  });
});
