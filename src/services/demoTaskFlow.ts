import { demoMemberUser, demoUser, makeId } from '@/services/demoStore';
import { TaskReviewErrorCode, type Task, type TaskAssignee, type TaskAssigneeInput } from '@/types/domain';
import { isLockedStep, liveStep, sortSteps } from '@/utils/taskSteps';

/*
  Demo-only: the step flow the API runs (release guide, section 3.5), so the
  demo build exercises the same screens and error handling as production.
  Never imported outside a `env.demoMode` branch.
*/

type DemoError = Error & { statusCode: number; code: string };

export function demoFlowError(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}): DemoError {
  return Object.assign(new Error(message), { statusCode, code }, extra);
}

const now = () => new Date().toISOString();

/** Make the task's own fields describe the live step, as the API does after every move. */
function mirrorLiveStep(task: Task) {
  const live = liveStep(task);
  if (!live) return;
  task.assignedToId = live.userId;
  task.assignedTo = live.user ?? demoMemberUser(live.userId) ?? null;
  task.approverId = live.approverId ?? null;
  task.approver = live.approverId ? demoMemberUser(live.approverId) ?? null : null;
}

/** Reach the first PENDING step, or finish the task when none is left. */
function advance(task: Task) {
  const next = sortSteps(task.assignees).find((step) => step.status === 'PENDING');
  const stamp = now();
  if (!next) {
    Object.assign(task, { status: 'DONE', completedAt: stamp, submittedForReviewAt: null });
    return;
  }
  Object.assign(next, { status: 'TODO', reachedAt: stamp });
  Object.assign(task, { status: 'TODO', submittedForReviewAt: null, reviewNote: null });
  mirrorLiveStep(task);
}

/** Steps for a new task, in the order sent. The first is reached at once unless the task is a draft. */
export function demoNewSteps(inputs: TaskAssigneeInput[], isDraft: boolean): TaskAssignee[] {
  const stamp = now();
  return inputs.map((input, index) => ({
    id: makeId('task-step'),
    stepOrder: index + 1,
    status: index === 0 && !isDraft ? 'TODO' : 'PENDING',
    userId: input.userId,
    role: input.role,
    user: demoMemberUser(input.userId),
    approverId: input.approverId ?? null,
    approver: input.approverId ? demoMemberUser(input.approverId) : null,
    reachedAt: index === 0 && !isDraft ? stamp : null,
    startedAt: null,
    submittedAt: null,
    reviewedAt: null,
    completedAt: null,
    reviewNote: null,
    assignedById: demoUser.id,
    createdAt: stamp,
  }));
}

/** After create or publish: point the task at its live step. */
export function demoStartFlow(task: Task) {
  if (!task.assignees.length || task.isDraft) return;
  if (!liveStep(task)) Object.assign(sortSteps(task.assignees)[0], { status: 'TODO', reachedAt: now() });
  mirrorLiveStep(task);
}

/**
 * Replace the flow. Started steps must come first, unchanged (409
 * STEP_FLOW_STARTED otherwise); everything after them is rebuilt.
 */
export function demoReplaceSteps(task: Task, inputs: TaskAssigneeInput[]) {
  const saved = sortSteps(task.assignees);
  const locked = saved.filter(isLockedStep);
  const keepsHistory = locked.every((step, index) => {
    const input = inputs[index];
    return input && input.userId === step.userId && input.role === step.role && (input.approverId ?? null) === (step.approverId ?? null);
  });
  if (!keepsHistory) {
    throw demoFlowError(409, TaskReviewErrorCode.STEP_FLOW_STARTED, 'Steps that have started cannot be changed or moved. Keep them first, as they are.', {
      lockedSteps: locked.map((step) => ({ stepOrder: step.stepOrder, userId: step.userId, role: step.role })),
    });
  }
  const live = liveStep(task);
  const rest = demoNewSteps(inputs.slice(locked.length), true).map((step, index) => ({ ...step, stepOrder: locked.length + index + 1 }));
  task.assignees = [...locked, ...rest];
  // A flow whose live step was not started yet keeps that person's turn if they are still next; otherwise the next step is reached.
  if (!task.isDraft && !liveStep(task) && task.status !== 'CANCELED' && task.status !== 'DONE') {
    if (live && rest[0] && rest[0].userId === live.userId && rest[0].role === live.role) {
      Object.assign(rest[0], { status: 'TODO', reachedAt: live.reachedAt ?? now() });
      mirrorLiveStep(task);
    } else {
      advance(task);
    }
  } else {
    mirrorLiveStep(task);
  }
}

/** `{ approverId }` on a flow changes the live step's approver ("Omar is on holiday"). */
export function demoSetLiveApprover(task: Task, approverId: string | null) {
  const live = liveStep(task);
  if (!live) return;
  live.approverId = approverId;
  live.approver = approverId ? demoMemberUser(approverId) : null;
  mirrorLiveStep(task);
}

function liveOrConflict(task: Task, action: string): TaskAssignee {
  const live = liveStep(task);
  if (!live || task.status === 'CANCELED' || task.status === 'DONE') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `A task in ${task.status} cannot take the action ${action}`, { from: task.status, action });
  }
  return live;
}

function notYourStep(): DemoError {
  return demoFlowError(403, TaskReviewErrorCode.NOT_YOUR_STEP, 'This step is not yours to act on.');
}

/** `PATCH …/status` on a flow: Start (the live person) or Cancel. Anything else is 409 STEP_FLOW_ONLY. */
export function demoFlowStatus(task: Task, status: Task['status'], actorId: string) {
  if (status === 'CANCELED') {
    Object.assign(task, { status: 'CANCELED', submittedForReviewAt: null });
    return;
  }
  if (status !== 'IN_PROGRESS') {
    throw demoFlowError(409, TaskReviewErrorCode.STEP_FLOW_ONLY, 'This task runs as a flow of steps. Use Start, Submit and the review actions.');
  }
  const live = liveOrConflict(task, 'start');
  if (live.userId !== actorId) throw notYourStep();
  if (live.status !== 'TODO') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is ${live.status} and cannot be started`, { from: live.status, action: 'start', stepOrder: live.stepOrder });
  }
  const stamp = now();
  Object.assign(live, { status: 'IN_PROGRESS', startedAt: stamp });
  task.status = 'IN_PROGRESS';
  task.startedAt = task.startedAt ?? stamp;
}

export function demoFlowSubmit(task: Task, actorId: string) {
  const live = liveOrConflict(task, 'submit-for-review');
  if (live.userId !== actorId) throw notYourStep();
  if (live.status !== 'TODO' && live.status !== 'IN_PROGRESS') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is ${live.status} and cannot be submitted`, { from: live.status, action: 'submit-for-review', stepOrder: live.stepOrder });
  }
  const stamp = now();
  live.startedAt = live.startedAt ?? stamp;
  task.startedAt = task.startedAt ?? stamp;
  live.submittedAt = stamp;
  if (live.approverId) {
    live.status = 'IN_REVIEW';
    Object.assign(task, { status: 'IN_REVIEW', submittedForReviewAt: stamp });
    return;
  }
  Object.assign(live, { status: 'DONE', completedAt: stamp });
  advance(task);
}

export function demoFlowApprove(task: Task, actorId: string) {
  const live = liveOrConflict(task, 'approve');
  if (live.status !== 'IN_REVIEW') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is not in review`, { from: live.status, action: 'approve', stepOrder: live.stepOrder });
  }
  if (live.approverId !== actorId) throw notYourStep();
  const stamp = now();
  Object.assign(live, { status: 'DONE', reviewedAt: stamp, completedAt: stamp, reviewNote: null });
  task.reviewedAt = stamp;
  advance(task);
}

export function demoFlowRequestChanges(task: Task, actorId: string, note: string) {
  const live = liveOrConflict(task, 'request-changes');
  if (live.status !== 'IN_REVIEW') {
    throw demoFlowError(409, TaskReviewErrorCode.INVALID_TRANSITION, `Step ${live.stepOrder} is not in review`, { from: live.status, action: 'request-changes', stepOrder: live.stepOrder });
  }
  if (live.approverId !== actorId) throw notYourStep();
  const stamp = now();
  Object.assign(live, { status: 'IN_PROGRESS', reviewedAt: stamp, reviewNote: note, submittedAt: null });
  Object.assign(task, { status: 'IN_PROGRESS', submittedForReviewAt: null, reviewedAt: stamp, reviewNote: note });
}
