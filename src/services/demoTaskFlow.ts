import { demoMemberUser, demoTaskLogs, demoUser, makeId, pushNotification } from '@/services/demoStore';
import { TaskReviewErrorCode, type Task, type TaskAssignee, type TaskAssigneeInput, type TaskStepStatus } from '@/types/domain';
import { flowSteps, liveStep } from '@/utils/taskSteps';

/*
  Demo-only: the step flow the API runs (release guide 3.5, parallel-steps
  guide 1), so the demo build exercises the same screens, rules and error
  handling as production. Never imported outside an `env.demoMode` branch.

  A step is the people sharing a `stepOrder`. Each person has their own
  status; the step moves to its approver only when everybody has submitted.
  Activity rows use the API's action names and metadata.
*/

type DemoError = Error & { statusCode: number; code: string };

export function demoFlowError(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}): DemoError {
  return Object.assign(new Error(message), { statusCode, code }, extra);
}

const now = () => new Date().toISOString();
const WORKING: ReadonlySet<string> = new Set(['TODO', 'IN_PROGRESS']);
const STARTED: ReadonlySet<string> = new Set(['IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'DONE']);

function log(task: Task, action: string, metadata: Record<string, unknown>) {
  demoTaskLogs.unshift({ id: makeId('task-log'), taskId: task.id, action, metadata, createdAt: now() });
}

/** The people on one step, by number. */
function peopleOn(task: Task, stepOrder: number): TaskAssignee[] {
  return task.assignees.filter((person) => person.stepOrder === stepOrder);
}

function stepMeta(task: Task, stepOrder: number): Record<string, unknown> {
  const people = peopleOn(task, stepOrder);
  return { stepOrder, approverId: people[0]?.approverId ?? null, stepUserIds: people.map((person) => person.userId) };
}

/** Make the task's own fields describe the live step, as the API does after every move. */
function mirror(task: Task) {
  const live = liveStep(task);
  if (!live) return;
  const working = live.assignees.find((person) => WORKING.has(person.status ?? ''));
  const lead = working ?? live.assignees[0];
  task.assignedToId = lead.userId;
  task.assignedTo = lead.user ?? demoMemberUser(lead.userId) ?? null;
  task.approverId = live.approverId;
  task.approver = live.approverId ? demoMemberUser(live.approverId) ?? null : null;
  if (live.status === 'IN_REVIEW') task.status = 'IN_REVIEW';
  else if (live.status === 'IN_PROGRESS') task.status = 'IN_PROGRESS';
  else if (task.status !== 'CANCELED') task.status = 'TODO';
}

/** `TASK_ASSIGNED` to each person on the step just reached, naming the step. Nobody is told about their own action. */
function notifyReached(task: Task, stepOrder: number) {
  const people = peopleOn(task, stepOrder);
  const count = flowSteps(task).length;
  for (const person of people) {
    if (person.userId !== demoUser.id) continue;
    const others = people.length - 1;
    pushNotification({
      type: 'TASK_ASSIGNED',
      title: 'Your turn on a task',
      message: `"${task.title}" is ready for you — step ${stepOrder} of ${count}${others ? `, alongside ${others} other${others > 1 ? 's' : ''}` : ''}`,
      readAt: null,
      relatedEntityType: 'TASK',
      relatedEntityId: task.id,
      metadata: { stepOrder, stepCount: count, role: person.role, stepUserIds: people.map((row) => row.userId) },
      // Whoever caused the step to be reached: the creator, the approver, or the last person on the previous step.
      actorUserId: demoUser.id,
    });
  }
}

/** Reach the next PENDING step (everybody on it TODO), or finish the task. */
function advance(task: Task) {
  const next = flowSteps(task).find((step) => step.status === 'PENDING');
  const stamp = now();
  if (!next) {
    Object.assign(task, { status: 'DONE', completedAt: stamp, submittedForReviewAt: null });
    pushNotification({ type: 'TASK_STATUS_CHANGED', title: 'Task finished', message: `Every step of "${task.title}" is done`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: task.id, actorUserId: demoUser.id });
    return;
  }
  for (const person of peopleOn(task, next.stepOrder)) Object.assign(person, { status: 'TODO', reachedAt: stamp });
  Object.assign(task, { submittedForReviewAt: null, reviewNote: null });
  mirror(task);
  notifyReached(task, next.stepOrder);
}

/**
 * Number the steps the way the API does. `stepOrder` on nobody: each person
 * is a step, in order. On everybody: same number = same step, closed up
 * (1, 3, 7 → 1, 2, 3). On some only: 400 STEP_ORDER_REQUIRED.
 */
function numberSteps(inputs: TaskAssigneeInput[]): number[] {
  const given = inputs.filter((input) => typeof input.stepOrder === 'number').length;
  if (given === 0) return inputs.map((_, index) => index + 1);
  if (given !== inputs.length) {
    throw demoFlowError(400, TaskReviewErrorCode.STEP_ORDER_REQUIRED, 'Give stepOrder to everybody or to nobody');
  }
  const distinct = [...new Set(inputs.map((input) => input.stepOrder as number))].sort((left, right) => left - right);
  return inputs.map((input) => distinct.indexOf(input.stepOrder as number) + 1);
}

/** The API's list checks on create and update. */
export function demoCheckSteps(inputs: TaskAssigneeInput[]) {
  const orders = numberSteps(inputs);
  const roles = new Set<string>();
  const onStep = new Set<string>();
  const approvers = new Map<number, Set<string>>();
  inputs.forEach((input, index) => {
    const order = orders[index];
    if (roles.has(`${input.userId}:${input.role}`) || onStep.has(`${order}:${input.userId}`)) {
      throw demoFlowError(400, TaskReviewErrorCode.DUPLICATE_ASSIGNEE, 'The same person is listed twice', { userId: input.userId, role: input.role, stepOrder: order });
    }
    roles.add(`${input.userId}:${input.role}`);
    onStep.add(`${order}:${input.userId}`);
    for (const userId of [input.userId, input.approverId]) {
      if (userId && !demoMemberUser(userId)) {
        throw demoFlowError(422, TaskReviewErrorCode.ASSIGNEE_NOT_A_MEMBER, 'Everybody on a task must be an active member of this client', { userId });
      }
    }
    if (input.approverId) approvers.set(order, new Set([...(approvers.get(order) ?? []), input.approverId]));
  });
  for (const [stepOrder, ids] of approvers) {
    if (ids.size > 1) throw demoFlowError(400, TaskReviewErrorCode.STEP_APPROVER_CONFLICT, 'One approver per step', { stepOrder, approverIds: [...ids] });
  }
}

/** Rows for a list of inputs. The step's approver is copied onto everybody on it. */
function rowsFor(inputs: TaskAssigneeInput[], status: TaskStepStatus): TaskAssignee[] {
  const orders = numberSteps(inputs);
  const approverOf = new Map<number, string>();
  inputs.forEach((input, index) => { if (input.approverId) approverOf.set(orders[index], input.approverId); });
  const stamp = now();
  return inputs.map((input, index) => {
    const approverId = approverOf.get(orders[index]) ?? null;
    return {
      id: makeId('task-step'),
      stepOrder: orders[index],
      status,
      userId: input.userId,
      role: input.role,
      user: demoMemberUser(input.userId),
      approverId,
      approver: approverId ? demoMemberUser(approverId) : null,
      reachedAt: null,
      startedAt: null,
      submittedAt: null,
      reviewedAt: null,
      completedAt: null,
      reviewNote: null,
      assignedById: demoUser.id,
      createdAt: stamp,
    };
  });
}

/** Rows for a new task: everybody PENDING until the flow starts. */
export function demoNewSteps(inputs: TaskAssigneeInput[]): TaskAssignee[] {
  demoCheckSteps(inputs);
  return rowsFor(inputs, 'PENDING');
}

/** After create or publish: reach the first step and point the task at it. */
export function demoStartFlow(task: Task) {
  if (!task.assignees.length || task.isDraft || liveStep(task)) return;
  advance(task);
}

function sameRow(left: Pick<TaskAssignee, 'userId' | 'role'>, right: Pick<TaskAssignee, 'userId' | 'role'>) {
  return left.userId === right.userId && left.role === right.role;
}

/**
 * Replace the flow under the editing rules (parallel-steps guide 1.3):
 * DONE steps are history; an IN_REVIEW step keeps its people and an approver;
 * the live step keeps everybody who started; PENDING steps are free.
 * Anything else is 409 STEP_FLOW_STARTED with `lockedSteps`.
 */
export function demoReplaceSteps(task: Task, inputs: TaskAssigneeInput[]) {
  demoCheckSteps(inputs);
  const saved = flowSteps(task);
  const next = rowsFor(inputs, 'PENDING');
  const nextSteps = [...new Set(next.map((row) => row.stepOrder as number))].map((order) => next.filter((row) => row.stepOrder === order));
  const fixed = saved.filter((step) => step.status !== 'PENDING');
  const locked = saved.flatMap((step) => step.assignees.filter((person) => step.status === 'DONE' || step.status === 'IN_REVIEW' || STARTED.has(person.status ?? '')))
    .map((person) => ({ stepOrder: person.stepOrder, userId: person.userId, role: person.role }));
  const refuse = () => demoFlowError(409, TaskReviewErrorCode.STEP_FLOW_STARTED, 'Steps that have started cannot lose the people who started them, and finished steps cannot change', { lockedSteps: locked });

  fixed.forEach((step, index) => {
    const people = nextSteps[index];
    if (!people) throw refuse();
    const approverId = people[0].approverId ?? null;
    if (step.status === 'DONE') {
      const same = people.length === step.assignees.length && step.assignees.every((person) => people.some((row) => sameRow(row, person)));
      if (!same || approverId !== step.approverId) throw refuse();
    } else if (step.status === 'IN_REVIEW') {
      const same = people.length === step.assignees.length && step.assignees.every((person) => people.some((row) => sameRow(row, person)));
      if (!same || !approverId) throw refuse();
    } else if (step.assignees.some((person) => STARTED.has(person.status ?? '') && !people.some((row) => sameRow(row, person)))) {
      throw refuse();
    }
    // Keep each person's own state; somebody new on the live step starts TODO now.
    for (const row of people) {
      const before = step.assignees.find((person) => sameRow(person, row));
      if (before) Object.assign(row, { ...before, stepOrder: row.stepOrder, approverId: row.approverId, approver: row.approver });
      else Object.assign(row, { status: 'TODO', reachedAt: now() });
    }
  });

  task.assignees = next;
  if (task.status === 'CANCELED' || task.status === 'DONE' || task.isDraft) return;
  const live = liveStep(task);
  if (live && live.status !== 'IN_REVIEW' && live.assignees.every((person) => person.status === 'SUBMITTED')) {
    // The last person still working was removed: the step moves on at once.
    finishStepSubmission(task, live.stepOrder);
    return;
  }
  if (!live) advance(task);
  else mirror(task);
}

/** `{ approverId }` on a flow changes the live step's approver ("Omar is on holiday"). */
export function demoSetLiveApprover(task: Task, approverId: string | null) {
  const live = liveStep(task);
  if (!live) return;
  for (const person of peopleOn(task, live.stepOrder)) {
    person.approverId = approverId;
    person.approver = approverId ? demoMemberUser(approverId) : null;
  }
  mirror(task);
}

function liveOrConflict(task: Task, action: string) {
  const live = liveStep(task);
  if (!live || task.status === 'CANCELED' || task.status === 'DONE') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action ${action}`, { from: task.status, action });
  }
  return live;
}

/**
 * Whose part an action is on: the caller's own; or, for an admin, the person
 * named in `onBehalfOfUserId`, else the only person who could take it.
 */
function partFor(task: Task, action: string, canTake: (person: TaskAssignee) => boolean, onBehalfOfUserId?: string): TaskAssignee {
  const live = liveOrConflict(task, action);
  const isAdmin = demoUser.platformRole === 'SUPER_ADMIN' || demoUser.platformRole === 'AGENCY_ADMIN';
  if (onBehalfOfUserId && onBehalfOfUserId !== demoUser.id) {
    if (!isAdmin) throw demoFlowError(403, TaskReviewErrorCode.NOT_YOUR_STEP, 'Only an admin can act for somebody else');
    const person = live.assignees.find((row) => row.userId === onBehalfOfUserId);
    if (!person) throw demoFlowError(422, TaskReviewErrorCode.NOT_IN_STEP, 'That person is not on this step', { stepOrder: live.stepOrder, userIds: [onBehalfOfUserId] });
    return person;
  }
  const own = live.assignees.find((row) => row.userId === demoUser.id);
  if (own) return own;
  if (!isAdmin) throw demoFlowError(403, TaskReviewErrorCode.NOT_YOUR_STEP, 'This step is not yours to act on');
  const candidates = live.assignees.filter(canTake);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw demoFlowError(409, TaskReviewErrorCode.STEP_ASSIGNEE_REQUIRED, 'Say whose part this is', { stepOrder: live.stepOrder, userIds: candidates.map((row) => row.userId) });
  }
  throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Nobody on step ${live.stepOrder} can ${action}`, { stepOrder: live.stepOrder, action });
}

/** `PATCH …/status` on a flow: Start your part, or Cancel. Anything else is 409 STEP_FLOW_ONLY. */
export function demoFlowStatus(task: Task, status: Task['status'], onBehalfOfUserId?: string) {
  if (status === 'CANCELED') {
    Object.assign(task, { status: 'CANCELED', submittedForReviewAt: null });
    log(task, 'STATUS_CHANGED', { toStatus: 'CANCELED' });
    return;
  }
  if (status !== 'IN_PROGRESS') {
    throw demoFlowError(409, TaskReviewErrorCode.STEP_FLOW_ONLY, 'This task runs as a flow of steps. Use Start, Submit and the review actions.');
  }
  const person = partFor(task, 'start', (row) => row.status === 'TODO', onBehalfOfUserId);
  if (person.status !== 'TODO') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `This part is ${person.status} and cannot be started`, { from: person.status, action: 'start', stepOrder: person.stepOrder, userId: person.userId });
  }
  const stamp = now();
  const firstStart = !task.startedAt;
  Object.assign(person, { status: 'IN_PROGRESS', startedAt: stamp });
  task.startedAt = task.startedAt ?? stamp;
  mirror(task);
  log(task, 'STATUS_CHANGED', { ...stepMeta(task, person.stepOrder as number), toStatus: 'IN_PROGRESS', stepUserId: person.userId, role: person.role });
  if (firstStart) {
    pushNotification({ type: 'TASK_STARTED', title: 'Work has started', message: `${person.user?.fullName ?? 'Someone'} started working on "${task.title}"`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: task.id, actorUserId: person.userId });
  }
}

/** Everybody on the step is in: to the approver, or (no approver) done and on to the next step. */
function finishStepSubmission(task: Task, stepOrder: number) {
  const people = peopleOn(task, stepOrder);
  const stamp = now();
  const approverId = people[0]?.approverId ?? null;
  if (approverId) {
    for (const person of people) person.status = 'IN_REVIEW';
    Object.assign(task, { status: 'IN_REVIEW', submittedForReviewAt: stamp });
    mirror(task);
    log(task, 'TASK_SUBMITTED_FOR_REVIEW', stepMeta(task, stepOrder));
    pushNotification({
      type: 'TASK_SUBMITTED_FOR_REVIEW',
      title: 'Step waiting for your review',
      message: people.length > 1 ? `Everybody on step ${stepOrder} of "${task.title}" has submitted` : `Step ${stepOrder} of "${task.title}" was submitted`,
      readAt: null,
      relatedEntityType: 'TASK',
      relatedEntityId: task.id,
      actorUserId: demoUser.id,
    });
    return;
  }
  for (const person of people) Object.assign(person, { status: 'DONE', completedAt: stamp });
  log(task, 'STEP_COMPLETED', stepMeta(task, stepOrder));
  advance(task);
}

export function demoFlowSubmit(task: Task, onBehalfOfUserId?: string) {
  const person = partFor(task, 'submit-for-review', (row) => WORKING.has(row.status ?? ''), onBehalfOfUserId);
  if (!WORKING.has(person.status ?? '')) {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `This part is ${person.status} and cannot be submitted`, { from: person.status, action: 'submit-for-review', stepOrder: person.stepOrder, userId: person.userId });
  }
  const stamp = now();
  const order = person.stepOrder as number;
  Object.assign(person, { status: 'SUBMITTED', startedAt: person.startedAt ?? stamp, submittedAt: stamp });
  task.startedAt = task.startedAt ?? stamp;
  const people = peopleOn(task, order);
  if (people.length > 1) {
    const submittedCount = people.filter((row) => row.status === 'SUBMITTED').length;
    const workSeconds = Math.round((new Date(stamp).getTime() - new Date(person.startedAt as string).getTime()) / 1000);
    log(task, 'STEP_WORK_SUBMITTED', { ...stepMeta(task, order), stepUserId: person.userId, role: person.role, submittedCount, assigneeCount: people.length, workSeconds });
  }
  if (people.some((row) => WORKING.has(row.status ?? ''))) {
    // Teammates still working: the approver is not told yet.
    mirror(task);
    return;
  }
  finishStepSubmission(task, order);
}

export function demoFlowApprove(task: Task) {
  const live = liveOrConflict(task, 'approve');
  if (live.status !== 'IN_REVIEW') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is not in review`, { from: live.status, action: 'approve', stepOrder: live.stepOrder });
  }
  const isAdmin = demoUser.platformRole === 'SUPER_ADMIN' || demoUser.platformRole === 'AGENCY_ADMIN';
  if (live.approverId !== demoUser.id && !isAdmin) throw demoFlowError(403, TaskReviewErrorCode.NOT_YOUR_STEP, 'Only the step approver can approve it');
  const stamp = now();
  for (const person of peopleOn(task, live.stepOrder)) Object.assign(person, { status: 'DONE', reviewedAt: stamp, completedAt: stamp, reviewNote: null });
  task.reviewedAt = stamp;
  log(task, 'TASK_APPROVED', stepMeta(task, live.stepOrder));
  advance(task);
}

/** Send back the people in `userIds` (everybody when empty); the rest keep their submission and wait. */
export function demoFlowRequestChanges(task: Task, note: string, userIds: string[] = []) {
  const live = liveOrConflict(task, 'request-changes');
  if (live.status !== 'IN_REVIEW') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is not in review`, { from: live.status, action: 'request-changes', stepOrder: live.stepOrder });
  }
  const isAdmin = demoUser.platformRole === 'SUPER_ADMIN' || demoUser.platformRole === 'AGENCY_ADMIN';
  if (live.approverId !== demoUser.id && !isAdmin) throw demoFlowError(403, TaskReviewErrorCode.NOT_YOUR_STEP, 'Only the step approver can send it back');
  const people = peopleOn(task, live.stepOrder);
  const outsiders = userIds.filter((id) => !people.some((person) => person.userId === id));
  if (outsiders.length) throw demoFlowError(422, TaskReviewErrorCode.NOT_IN_STEP, 'Somebody named is not on this step', { stepOrder: live.stepOrder, userIds: outsiders });
  const reopen = userIds.length ? userIds : people.map((person) => person.userId);
  const stamp = now();
  for (const person of people) {
    if (reopen.includes(person.userId)) Object.assign(person, { status: 'IN_PROGRESS', reviewedAt: stamp, reviewNote: note, submittedAt: null });
    else person.status = 'SUBMITTED';
  }
  Object.assign(task, { submittedForReviewAt: null, reviewedAt: stamp, reviewNote: note });
  mirror(task);
  log(task, 'TASK_CHANGES_REQUESTED', { ...stepMeta(task, live.stepOrder), note, reopenedUserIds: reopen });
  if (reopen.includes(demoUser.id)) {
    pushNotification({ type: 'TASK_CHANGES_REQUESTED', title: 'Changes requested', message: `Changes requested on "${task.title}": ${note}`, readAt: null, relatedEntityType: 'TASK', relatedEntityId: task.id, actorUserId: demoUser.id });
  }
}

