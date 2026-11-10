import { TaskStatus, TaskStepStatus, type Membership, type Task, type TaskAssignee, type TaskAssigneeInput } from '@/types/domain';
import { AGENCY_ROLES, membershipRoles } from '@/utils/roles';
import { newPersonRow, type TaskPersonRow } from '@/utils/taskAssignees';

/*
  The step flow (release guide, section 3.5).

  A task with `assignees` runs as one flow of steps, in order: each person
  works, submits, and — if their step has an approver — waits for that
  approver before the next person is told. A task without `assignees` keeps
  the single assignee / single approver flow (section 3.4).

  These helpers mirror the API's rules so the UI only offers a button the
  server will accept. Hiding a control is cosmetic: the API answers
  403 NOT_YOUR_STEP / 409 STEP_FLOW_ONLY either way.
*/

/** Steps that are the live one: their person's turn, working, or with their approver. */
const LIVE: ReadonlySet<string> = new Set([TaskStepStatus.TODO, TaskStepStatus.IN_PROGRESS, TaskStepStatus.IN_REVIEW]);

/** Steps that are history: the API refuses to change or move them (409 STEP_FLOW_STARTED). */
const LOCKED: ReadonlySet<string> = new Set([TaskStepStatus.IN_PROGRESS, TaskStepStatus.IN_REVIEW, TaskStepStatus.DONE]);

/** Flow order. `stepOrder` when the API sends it; otherwise the order the list arrived in. */
export function sortSteps(steps: readonly TaskAssignee[]): TaskAssignee[] {
  return steps
    .map((step, index) => ({ step, rank: typeof step.stepOrder === 'number' ? step.stepOrder : index + 1 }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ step }) => step);
}

/** True when the task runs as a flow of steps rather than one assignee and one approver. */
export function isStepFlow(task: Pick<Task, 'assignees'> | null | undefined): boolean {
  return Boolean(task?.assignees?.length);
}

/** The step whose turn it is, or `null` when nothing is live (not reached yet, or every step done). */
export function liveStep(task: Pick<Task, 'assignees'>): TaskAssignee | null {
  return sortSteps(task.assignees ?? []).find((step) => step.status && LIVE.has(step.status)) ?? null;
}

export function isLockedStep(step: Pick<TaskAssignee, 'status'>): boolean {
  return Boolean(step.status && LOCKED.has(step.status));
}

/** "Step 2 of 3". */
export function stepPosition(task: Pick<Task, 'assignees'>, step: TaskAssignee): { index: number; count: number } {
  const steps = sortSteps(task.assignees ?? []);
  return { index: steps.findIndex((item) => item.id === step.id) + 1, count: steps.length };
}

/** A closed task takes no step actions; only a cancelled-or-done check is needed beside the step's own status. */
function isOpen(task: Pick<Task, 'status' | 'isDraft'>): boolean {
  return !task.isDraft && task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED;
}

export interface StepActions {
  /** The live step's person, before they have started: Start. */
  canStart: boolean;
  /** The live step's person, while working (or not yet started): Submit. */
  canSubmit: boolean;
  /** The live step's approver, while it is with them: Approve / Request changes. */
  canReview: boolean;
}

const NONE: StepActions = { canStart: false, canSubmit: false, canReview: false };

/**
 * What the signed-in person may do on a flow right now. Only the live step's
 * person may start or submit, and only its approver may decide — the API
 * answers anybody else with 403 NOT_YOUR_STEP, admins included.
 */
export function stepActions(task: Pick<Task, 'assignees' | 'status' | 'isDraft'>, userId: string | null | undefined): StepActions {
  if (!userId || !isOpen(task)) return NONE;
  const live = liveStep(task);
  if (!live) return NONE;
  const mine = live.userId === userId;
  return {
    canStart: mine && live.status === TaskStepStatus.TODO,
    canSubmit: mine && (live.status === TaskStepStatus.TODO || live.status === TaskStepStatus.IN_PROGRESS),
    canReview: Boolean(live.approverId) && live.approverId === userId && live.status === TaskStepStatus.IN_REVIEW,
  };
}

/** Milliseconds one person spent on their step: `completedAt − startedAt`. Null until both exist. */
export function stepDurationMs(step: Pick<TaskAssignee, 'startedAt' | 'completedAt'>): number | null {
  if (!step.startedAt || !step.completedAt) return null;
  const ms = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** "45m", "3h 10m", "2d 4h". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

/**
 * Who may be put on a step, as its person or its approver: an ACTIVE member of
 * this client holding at least one internal (agency) role. The step flow is an
 * internal staff workflow, so Client Owners and Client Reviewers are left out;
 * somebody who is also staff on the client (Designer and Client Reviewer, say)
 * stays eligible. Client sign-off on posts is a separate flow and is untouched.
 */
export function isStepEligible(member: Pick<Membership, 'status' | 'roles' | 'role'>): boolean {
  return member.status === 'ACTIVE' && membershipRoles(member).some((role) => AGENCY_ROLES.includes(role));
}

/* ---------- The form: steps as editable rows ---------- */

/** The form's rows for a saved task: flow order, with started steps locked in place. */
export function stepRowsFor(task: Pick<Task, 'assignees'>): TaskPersonRow[] {
  return sortSteps(task.assignees ?? []).map((step) => ({
    ...newPersonRow(step.userId, step.role),
    approverId: step.approverId ?? '',
    locked: isLockedStep(step),
    stepStatus: step.status,
  }));
}

/** The rows as the API takes them: complete rows only, in order, with the step approver when there is one. */
export function stepInputs(rows: readonly TaskPersonRow[]): TaskAssigneeInput[] {
  return rows.flatMap((row) => (row.userId && row.role
    ? [{ userId: row.userId, role: row.role, ...(row.approverId ? { approverId: row.approverId } : {}) }]
    : []));
}

/** True when two lists are the same flow: same people, roles and approvers, in the same order. */
export function sameSteps(next: readonly TaskAssigneeInput[], saved: readonly TaskAssignee[]): boolean {
  const ordered = sortSteps(saved);
  return next.length === ordered.length && next.every((row, index) => {
    const step = ordered[index];
    return row.userId === step.userId && row.role === step.role && (row.approverId ?? null) === (step.approverId ?? null);
  });
}

/** How many rows at the top are locked. Locked rows always stay first and in order. */
export function lockedCount(rows: readonly Pick<TaskPersonRow, 'locked'>[]): number {
  const index = rows.findIndex((row) => !row.locked);
  return index === -1 ? rows.length : index;
}

/** Move a row one place up or down, never into or across the locked steps. Returns the same list when the move is not allowed. */
export function moveRow<T extends Pick<TaskPersonRow, 'locked'>>(rows: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const floor = lockedCount(rows);
  if (rows[index]?.locked || target < floor || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
