import {
  TaskStatus,
  TaskStepStatus,
  type Membership,
  type Task,
  type TaskAssignee,
  type TaskAssigneeInput,
  type TaskAssigneeRole,
  type TaskStep,
} from '@/types/domain';
import { AGENCY_ROLES, membershipRoles } from '@/utils/roles';

/*
  The step flow (release guide 3.5, parallel-steps guide 1).

  A task with `assignees` runs as a flow of steps, one after another. A step
  holds one or more people working side by side, each with their own status
  and clock, and at most one approver shared by all of them. The step goes to
  its approver only when everybody on it has submitted; without an approver it
  finishes then and the next step is reached. A task without `assignees` keeps
  the single assignee / single approver flow.

  These helpers mirror the API's rules so the UI only offers what the server
  accepts. Hiding a control is cosmetic: the API answers 403 NOT_YOUR_STEP /
  409 STEP_FLOW_ONLY / 409 INVALID_TRANSITION either way.
*/

const LIVE: ReadonlySet<string> = new Set([TaskStepStatus.TODO, TaskStepStatus.IN_PROGRESS, TaskStepStatus.IN_REVIEW]);
/** A person counts as "submitted" for "1 of 2 submitted" in any of these. */
const HANDED_IN: ReadonlySet<string> = new Set([TaskStepStatus.SUBMITTED, TaskStepStatus.IN_REVIEW, TaskStepStatus.DONE]);
/** A person who has started is kept: the API refuses to remove them (409 STEP_FLOW_STARTED). */
const STARTED: ReadonlySet<string> = new Set([TaskStepStatus.IN_PROGRESS, TaskStepStatus.SUBMITTED, TaskStepStatus.IN_REVIEW, TaskStepStatus.DONE]);

/** The rows in flow order: by `stepOrder`, else (older responses) the order they arrived in. */
export function sortSteps(rows: readonly TaskAssignee[]): TaskAssignee[] {
  return rows
    .map((row, index) => ({ row, index, rank: typeof row.stepOrder === 'number' ? row.stepOrder : index + 1 }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ row }) => row);
}

/** True when the task runs as a flow of steps rather than one assignee and one approver. */
export function isStepFlow(task: Pick<Task, 'assignees'> | null | undefined): boolean {
  return Boolean(task?.assignees?.length);
}

/** A step's status from its people, for a response without `steps` (mirrors the API). */
function stepStatusOf(people: readonly TaskAssignee[]): TaskStepStatus {
  const statuses = people.map((person) => person.status ?? TaskStepStatus.PENDING);
  if (statuses.every((status) => status === TaskStepStatus.DONE)) return TaskStepStatus.DONE;
  if (statuses.some((status) => status === TaskStepStatus.IN_REVIEW)) return TaskStepStatus.IN_REVIEW;
  if (statuses.every((status) => status === TaskStepStatus.PENDING)) return TaskStepStatus.PENDING;
  if (statuses.some((status) => status === TaskStepStatus.IN_PROGRESS || status === TaskStepStatus.SUBMITTED)) return TaskStepStatus.IN_PROGRESS;
  return TaskStepStatus.TODO;
}

/**
 * The flow, one entry per step, in order. The API's `steps` when it sends
 * them; otherwise grouped from `assignees` (same `stepOrder` = same step, and
 * a row without one is a step of its own).
 */
export function flowSteps(task: Pick<Task, 'assignees' | 'steps'>): TaskStep[] {
  if (Array.isArray(task.steps) && task.steps.length) {
    return [...task.steps]
      .sort((left, right) => left.stepOrder - right.stepOrder)
      .map((step) => ({ ...step, assignees: sortSteps(step.assignees ?? []) }));
  }
  const groups: TaskAssignee[][] = [];
  const byOrder = new Map<number, TaskAssignee[]>();
  sortSteps(task.assignees ?? []).forEach((row) => {
    if (typeof row.stepOrder !== 'number') {
      groups.push([row]);
      return;
    }
    const group = byOrder.get(row.stepOrder);
    if (group) group.push(row);
    else {
      const next = [row];
      byOrder.set(row.stepOrder, next);
      groups.push(next);
    }
  });
  return groups.map((people, index) => {
    const approverRow = people.find((person) => person.approverId);
    return {
      stepOrder: people[0].stepOrder ?? index + 1,
      status: stepStatusOf(people),
      approverId: approverRow?.approverId ?? null,
      approver: approverRow?.approver ?? null,
      reachedAt: people[0].reachedAt ?? null,
      completedAt: people.every((person) => person.completedAt) ? people[people.length - 1].completedAt ?? null : null,
      assigneeCount: people.length,
      submittedCount: people.filter((person) => person.status && HANDED_IN.has(person.status)).length,
      assignees: people,
    };
  });
}

/** The step whose turn it is, or `null` (not reached yet, or every step done). */
export function liveStep(task: Pick<Task, 'assignees' | 'steps'>): TaskStep | null {
  return flowSteps(task).find((step) => LIVE.has(step.status)) ?? null;
}

/** "Step 2 of 3". */
export function stepPosition(task: Pick<Task, 'assignees' | 'steps'>, step: Pick<TaskStep, 'stepOrder'>): { index: number; count: number } {
  const steps = flowSteps(task);
  return { index: steps.findIndex((item) => item.stepOrder === step.stepOrder) + 1, count: steps.length };
}

/** The signed-in person's own part of the live step, if they are on it. */
export function myPart(task: Pick<Task, 'assignees' | 'steps'>, userId: string | null | undefined): TaskAssignee | null {
  if (!userId) return null;
  return liveStep(task)?.assignees.find((person) => person.userId === userId) ?? null;
}

function isOpen(task: Pick<Task, 'status' | 'isDraft'>): boolean {
  return !task.isDraft && task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED;
}

export interface StepActions {
  /** Your part is TODO: Start. */
  canStart: boolean;
  /** Your part is TODO or IN_PROGRESS: Submit. */
  canSubmit: boolean;
  /** You handed your part in and teammates are still working: no button, "Waiting for teammates". */
  waitingForTeammates: boolean;
  /** The step is with its approver and you are that approver (or an admin): Approve / Request changes. */
  canReview: boolean;
}

const NONE: StepActions = { canStart: false, canSubmit: false, waitingForTeammates: false, canReview: false };

/**
 * What the signed-in person may do on a flow right now. Start and Submit are
 * based on their OWN row in the live step, never on the task's status. An
 * admin may also review any step that is with its approver.
 */
export function stepActions(
  task: Pick<Task, 'assignees' | 'steps' | 'status' | 'isDraft'>,
  userId: string | null | undefined,
  isAdmin = false,
): StepActions {
  if (!userId || !isOpen(task)) return NONE;
  const live = liveStep(task);
  if (!live) return NONE;
  const mine = live.assignees.find((person) => person.userId === userId);
  const status = mine?.status;
  return {
    canStart: status === TaskStepStatus.TODO,
    canSubmit: status === TaskStepStatus.TODO || status === TaskStepStatus.IN_PROGRESS,
    waitingForTeammates: status === TaskStepStatus.SUBMITTED,
    canReview: live.status === TaskStepStatus.IN_REVIEW && (live.approverId === userId || isAdmin),
  };
}

/**
 * For an admin who is not on the live step: whether anybody on it could take
 * Start or Submit, so the admin may press it for them. With several, the API
 * answers 409 STEP_ASSIGNEE_REQUIRED and the UI asks for whom.
 */
export function adminStepActions(task: Pick<Task, 'assignees' | 'steps' | 'status' | 'isDraft'>): { canStart: boolean; canSubmit: boolean } {
  if (!isOpen(task)) return { canStart: false, canSubmit: false };
  const live = liveStep(task);
  const people = live?.assignees ?? [];
  return {
    canStart: people.some((person) => person.status === TaskStepStatus.TODO),
    canSubmit: people.some((person) => person.status === TaskStepStatus.TODO || person.status === TaskStepStatus.IN_PROGRESS),
  };
}

/* ---------- Durations ---------- */

/** Milliseconds between two timestamps, or null until both exist. */
export function spanMs(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** One person's own work time: `submittedAt − startedAt`, else (older rows) `completedAt − startedAt`. */
export function stepDurationMs(person: Pick<TaskAssignee, 'startedAt' | 'submittedAt' | 'completedAt'>): number | null {
  return spanMs(person.startedAt, person.submittedAt ?? person.completedAt);
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
 * Who may be put on a step, as one of its people or as its approver: an
 * ACTIVE member of this client with at least one internal (agency) role. The
 * flow is an internal staff workflow, so Client Owners and Reviewers are left
 * out; somebody who is also staff on the client stays eligible.
 */
export function isStepEligible(member: Pick<Membership, 'status' | 'roles' | 'role'>): boolean {
  return member.status === 'ACTIVE' && membershipRoles(member).some((role) => AGENCY_ROLES.includes(role));
}

/* ---------- The form: steps of people ---------- */

let seed = 0;
const nextKey = (prefix: string) => {
  seed += 1;
  return `${prefix}-${seed}`;
};

/** One person on a step, as the form edits them. */
export interface FormPerson {
  key: string;
  userId: string;
  role: TaskAssigneeRole | '';
  /** Started, submitted or finished: kept, never removed or changed. */
  locked?: boolean;
  /** Their saved status, for the locked rows' badge. */
  status?: TaskStepStatus;
}

/** One step, as the form edits it. */
export interface FormStep {
  key: string;
  approverId: string;
  people: FormPerson[];
  /** The saved step's status. New steps have none. */
  status?: TaskStepStatus;
}

export function newFormPerson(userId = '', role: TaskAssigneeRole | '' = ''): FormPerson {
  return { key: nextKey('person'), userId, role };
}

export function newFormStep(people: FormPerson[] = [newFormPerson()]): FormStep {
  return { key: nextKey('step'), approverId: '', people };
}

/** What may still change on a step, from its saved status (parallel-steps guide 1.3). */
export interface StepEditRules {
  /** DONE, IN_REVIEW or live: stays where it is, ahead of everything new. */
  anchored: boolean;
  /** People may be added. */
  canAddPeople: boolean;
  /** The approver may be changed. */
  canChangeApprover: boolean;
  /** The approver may be cleared. */
  canClearApprover: boolean;
  /** The whole step may be removed. */
  canRemoveStep: boolean;
}

export function stepEditRules(step: Pick<FormStep, 'status' | 'people'>): StepEditRules {
  switch (step.status) {
    case TaskStepStatus.DONE:
      return { anchored: true, canAddPeople: false, canChangeApprover: false, canClearApprover: false, canRemoveStep: false };
    case TaskStepStatus.IN_REVIEW:
      return { anchored: true, canAddPeople: false, canChangeApprover: true, canClearApprover: false, canRemoveStep: false };
    case TaskStepStatus.TODO:
    case TaskStepStatus.IN_PROGRESS:
      return { anchored: true, canAddPeople: true, canChangeApprover: true, canClearApprover: true, canRemoveStep: !step.people.some((person) => person.locked) };
    default:
      return { anchored: false, canAddPeople: true, canChangeApprover: true, canClearApprover: true, canRemoveStep: true };
  }
}

/** The form's steps for a saved task. People who started are locked; an IN_REVIEW or DONE step locks all its people. */
export function formStepsFor(task: Pick<Task, 'assignees' | 'steps'>): FormStep[] {
  return flowSteps(task).map((step) => {
    const wholeStepLocked = step.status === TaskStepStatus.DONE || step.status === TaskStepStatus.IN_REVIEW;
    return {
      key: nextKey('step'),
      approverId: step.approverId ?? '',
      status: step.status,
      people: step.assignees.map((person) => ({
        key: nextKey('person'),
        userId: person.userId,
        role: person.role,
        status: person.status,
        locked: wholeStepLocked || Boolean(person.status && STARTED.has(person.status)),
      })),
    };
  });
}

/** How many steps at the top are anchored. They stay first and in order. */
export function anchoredCount(steps: readonly Pick<FormStep, 'status' | 'people'>[]): number {
  const index = steps.findIndex((step) => !stepEditRules(step).anchored);
  return index === -1 ? steps.length : index;
}

/** Move a step one place up or down, never into or across the anchored ones. Returns the same list when not allowed. */
export function moveStep<T extends Pick<FormStep, 'status' | 'people'>>(steps: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const floor = anchoredCount(steps);
  if (index < floor || target < floor || target >= steps.length) return [...steps];
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The steps as the API takes them: complete rows only, in order. `stepOrder`
 * goes on everybody once any step has more than one person (400
 * STEP_ORDER_REQUIRED otherwise); a one-person-per-step flow is sent the old
 * way, without it. The step's approver goes on every person of the step.
 */
export function stepInputs(steps: readonly FormStep[]): TaskAssigneeInput[] {
  const filled = steps
    .map((step) => ({ step, people: step.people.filter((person) => person.userId && person.role) }))
    .filter(({ people }) => people.length > 0);
  const grouped = filled.some(({ people }) => people.length > 1);
  return filled.flatMap(({ step, people }, index) => people.map((person) => ({
    userId: person.userId,
    role: person.role as TaskAssigneeRole,
    ...(grouped ? { stepOrder: index + 1 } : {}),
    ...(step.approverId ? { approverId: step.approverId } : {}),
  })));
}

/** True when the inputs are the saved flow: same people, roles, steps and approvers, in the same order. */
export function sameSteps(next: readonly TaskAssigneeInput[], task: Pick<Task, 'assignees' | 'steps'>): boolean {
  const saved = flowSteps(task).flatMap((step, index) => step.assignees.map((person) => ({
    userId: person.userId,
    role: person.role,
    step: index + 1,
    approverId: step.approverId ?? null,
  })));
  let step = 0;
  let previousOrder: number | undefined;
  const sent = next.map((row) => {
    if (row.stepOrder === undefined || row.stepOrder !== previousOrder) step += 1;
    previousOrder = row.stepOrder;
    return { userId: row.userId, role: row.role, step, approverId: row.approverId ?? null };
  });
  return sent.length === saved.length && sent.every((row, index) => {
    const other = saved[index];
    return row.userId === other.userId && row.role === other.role && row.step === other.step && row.approverId === other.approverId;
  });
}

/** Index pairs [step, person] of people listed twice: on the same step, or in the same role anywhere (400 DUPLICATE_ASSIGNEE). */
export function duplicatePeople(steps: readonly FormStep[]): Array<{ step: number; person: number; reason: 'SAME_STEP' | 'SAME_ROLE' }> {
  const roles = new Set<string>();
  const found: Array<{ step: number; person: number; reason: 'SAME_STEP' | 'SAME_ROLE' }> = [];
  steps.forEach((step, stepIndex) => {
    const onStep = new Set<string>();
    step.people.forEach((person, personIndex) => {
      if (!person.userId) return;
      if (onStep.has(person.userId)) found.push({ step: stepIndex, person: personIndex, reason: 'SAME_STEP' });
      else if (person.role && roles.has(`${person.userId}:${person.role}`)) found.push({ step: stepIndex, person: personIndex, reason: 'SAME_ROLE' });
      onStep.add(person.userId);
      if (person.role) roles.add(`${person.userId}:${person.role}`);
    });
  });
  return found;
}

/** Everybody on a task's flow, in one list, for counting against the 20-people limit. */
export function peopleCount(steps: readonly FormStep[]): number {
  return steps.reduce((total, step) => total + step.people.length, 0);
}
