import { TaskAssigneeRole, type CompanyMembershipRole, type Membership, type Task, type TaskAssignee, type TaskAssigneeInput } from '@/types/domain';
import type { AppLanguage } from '@/i18n/messages';
import { membershipRoles } from '@/utils/roles';
import { compareNames } from '@/utils/sort';

/** One row of the people field. `key` keeps React's identity stable while rows are added and removed. */
export interface TaskPersonRow {
  key: string;
  userId: string;
  role: TaskAssigneeRole | '';
}

let rowSeed = 0;
export function newPersonRow(userId = '', role: TaskAssigneeRole | '' = ''): TaskPersonRow {
  rowSeed += 1;
  return { key: `person-${rowSeed}`, userId, role };
}

/** The seven task roles, in the order pickers and lists show them. */
export const TASK_ASSIGNEE_ROLES: readonly TaskAssigneeRole[] = Object.values(TaskAssigneeRole);

const LABELS: Record<TaskAssigneeRole, { en: string; ar: string }> = {
  ACCOUNT_MANAGER: { en: 'Account Manager', ar: 'مدير الحساب' },
  ART_DIRECTOR: { en: 'Art Director', ar: 'المدير الفني' },
  DESIGNER: { en: 'Designer', ar: 'المصمّم' },
  COPYWRITER: { en: 'Copywriter', ar: 'كاتب المحتوى' },
  CONTENT_CREATOR: { en: 'Content Creator', ar: 'صانع المحتوى' },
  SOCIAL_MEDIA_MANAGER: { en: 'Social Media Manager', ar: 'مدير السوشال ميديا' },
  SALES_AGENT: { en: 'Sales Agent', ar: 'مندوب المبيعات' },
};

export function isTaskAssigneeRole(value: unknown): value is TaskAssigneeRole {
  return typeof value === 'string' && value in LABELS;
}

/** One language at a time. An unknown role from a newer API reads as itself rather than crashing. */
export function taskRoleLabel(role: string, lang: AppLanguage = 'en'): string {
  return isTaskAssigneeRole(role) ? LABELS[role][lang] : role;
}

/** "Art Director and Designer" — the way the notification names somebody's roles. */
export function taskRolesLabel(roles: readonly string[], lang: AppLanguage = 'en'): string {
  const labels = roles.map((role) => taskRoleLabel(role, lang));
  if (labels.length <= 1) return labels.join('');
  const and = lang === 'ar' ? ' و' : ' and ';
  return `${labels.slice(0, -1).join(', ')}${and}${labels[labels.length - 1]}`;
}

/**
 * The task role to pre-pick for a person: their first company role that is
 * also a task role. None for somebody whose company roles have no match — the
 * user picks one, and CONTENT_CREATOR never has a company role behind it.
 */
export function suggestTaskRole(
  member: Pick<Membership, 'roles' | 'role'> | null | undefined,
  /** Roles to skip — ones this person already plays on the task. */
  exclude: ReadonlySet<string> = new Set(),
): TaskAssigneeRole | undefined {
  return membershipRoles(member).find((role): role is CompanyMembershipRole & TaskAssigneeRole => isTaskAssigneeRole(role) && !exclude.has(role));
}

export function assigneeName(row: Pick<TaskAssignee, 'userId' | 'user'>): string {
  return row.user?.fullName || row.user?.email || row.userId;
}

/** The API does not order the list: lead first, then by role, then by name. */
export function sortAssignees(rows: readonly TaskAssignee[], leadId?: string | null): TaskAssignee[] {
  const rank = (role: string) => {
    const index = TASK_ASSIGNEE_ROLES.indexOf(role as TaskAssigneeRole);
    return index === -1 ? TASK_ASSIGNEE_ROLES.length : index;
  };
  return [...rows].sort((left, right) => {
    const leadOrder = Number(right.userId === leadId) - Number(left.userId === leadId);
    if (leadOrder) return leadOrder;
    return rank(left.role) - rank(right.role) || compareNames(assigneeName(left), assigneeName(right));
  });
}

/** Index of each row that repeats an earlier row's person and role. The API answers 400 DUPLICATE_ASSIGNEE for them. */
export function duplicateAssigneeIndexes(rows: ReadonlyArray<{ userId: string; role: string }>): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    if (!row.userId || !row.role) return;
    const key = `${row.userId}:${row.role}`;
    if (seen.has(key)) duplicates.push(index);
    seen.add(key);
  });
  return duplicates;
}

/** True when two lists name the same people in the same roles, whatever the order. */
export function sameAssignees(left: readonly TaskAssigneeInput[], right: readonly TaskAssigneeInput[]): boolean {
  if (left.length !== right.length) return false;
  const key = (row: TaskAssigneeInput) => `${row.userId}:${row.role}`;
  const keys = new Set(left.map(key));
  return right.every((row) => keys.has(key(row)));
}

/** The lead or anybody on the list, in any role — who may submit the task for review and whose "My tasks" it is in. */
export function isOnTask(task: Pick<Task, 'assignedToId'> & { assignees?: readonly Pick<TaskAssignee, 'userId'>[] }, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return task.assignedToId === userId || (task.assignees ?? []).some((row) => row.userId === userId);
}

/** `ASSIGNEES_CHANGED` metadata, read defensively: `{ added: [{ userId, role }], removed: [...] }`. */
export function readAssigneeChanges(metadata: Record<string, unknown> | undefined): { added: TaskAssigneeInput[]; removed: TaskAssigneeInput[] } {
  const read = (value: unknown): TaskAssigneeInput[] =>
    Array.isArray(value)
      ? value.filter((item): item is TaskAssigneeInput =>
          Boolean(item) && typeof item === 'object' && typeof (item as TaskAssigneeInput).userId === 'string' && typeof (item as TaskAssigneeInput).role === 'string')
      : [];
  return { added: read(metadata?.added), removed: read(metadata?.removed) };
}
