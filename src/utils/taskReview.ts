import { TaskStatus, type Task, type User } from '@/types/domain';

/*
  Who may do what to a task in the review flow.

  These mirror the API's rules so a button is only offered to somebody the
  server will let press it. Hiding a control is cosmetic — the API answers 403
  either way — but a button that always fails is worse than no button.

  `isAdmin` is the platform role (Agency Admin / Super Admin), who may act for
  anybody. Their press is logged under their own name.
*/

interface Actor {
  userId?: string | null;
  isAdmin: boolean;
}

/** Statuses a task can be submitted from. Anything else is a 409. */
export const SUBMITTABLE_STATUSES: readonly TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

/**
 * The values the status control may offer. `IN_REVIEW` is deliberately
 * absent: the status endpoint refuses it in both directions, and moving into
 * or out of review is what the review actions are for.
 */
export const STATUS_OPTIONS: readonly TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
  TaskStatus.CANCELED,
];

export function isInReview(task: Pick<Task, 'status'>): boolean {
  return task.status === TaskStatus.IN_REVIEW;
}

/** In review with nobody named — every pre-release review lands here. */
export function needsApprover(task: Pick<Task, 'status' | 'approverId'>): boolean {
  return isInReview(task) && !task.approverId;
}

export function isAssignee(task: Pick<Task, 'assignedToId'>, actor: Actor): boolean {
  return Boolean(actor.userId) && task.assignedToId === actor.userId;
}

export function isApprover(task: Pick<Task, 'approverId'>, actor: Actor): boolean {
  return Boolean(actor.userId) && task.approverId === actor.userId;
}

/** The assignee or an admin, on a task that is TODO or IN_PROGRESS. Approver may still be missing — that is a 422 the UI handles by asking for one. */
export function canSubmitForReview(task: Pick<Task, 'status' | 'assignedToId'>, actor: Actor): boolean {
  return SUBMITTABLE_STATUSES.includes(task.status) && (actor.isAdmin || isAssignee(task, actor));
}

/** The approver or an admin, on a task that is in review. */
export function canReview(task: Pick<Task, 'status' | 'approverId'>, actor: Actor): boolean {
  return isInReview(task) && (actor.isAdmin || isApprover(task, actor));
}

/** `assignedToId` is the doer through every round; the approver's status flags somebody who left. */
export function approverIsInactive(task: Pick<Task, 'approver'>): boolean {
  const status = task.approver?.status;
  return Boolean(status) && status !== 'ACTIVE';
}

export function userLabel(user?: User | null, fallback = 'Nobody'): string {
  if (!user) return fallback;
  return user.fullName || user.email || fallback;
}

/** Hours since a timestamp. `null` when there is nothing to age. */
export function hoursSince(value?: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now - time) / 3_600_000);
}

/** "waiting 2d 3h" — the age of an open review, from `submittedForReviewAt`. */
export function formatWaiting(value?: string | null, now?: number): string {
  const hours = hoursSince(value, now);
  if (hours === null) return '—';
  const minutes = Math.round(hours * 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const wholeHours = Math.floor(hours);
  if (wholeHours < 24) return `${wholeHours}h`;
  const days = Math.floor(wholeHours / 24);
  const remainder = wholeHours % 24;
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

/** Waiting long enough to chase. One day is the threshold the admin dashboard also uses for the oldest-first sort. */
export function isWaitingLong(value?: string | null, now?: number): boolean {
  const hours = hoursSince(value, now);
  return hours !== null && hours >= 24;
}

/** Oldest submission first — the top row is the one keeping people waiting. */
export function byWaitingLongest(left: Pick<Task, 'submittedForReviewAt'>, right: Pick<Task, 'submittedForReviewAt'>): number {
  return (left.submittedForReviewAt ?? '').localeCompare(right.submittedForReviewAt ?? '');
}
