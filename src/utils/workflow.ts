import { LeadStatus, PostStatus, TaskStatus, type ContentPost, type Lead, type Task } from '@/types/domain';

/*
  The LINEAR happy path, for the stepper on a post detail page. Five steps by
  design: CHANGES_REQUESTED and CANCELED are off-path exceptions, which
  WorkflowStepper renders as a badge rather than a step.

  Do NOT reuse this for board columns or summary tiles — it is not a complete
  list of statuses. PostsPage did exactly that, so posts in Changes requested,
  Scheduled or Canceled had no tile and were uncounted. Use POST_BOARD.
*/
export const POST_WORKFLOW: Array<{ status: PostStatus; label: string; description: string }> = [
  { status: PostStatus.DRAFT, label: 'Draft', description: 'Being prepared. Internal review runs as staged tasks.' },
  { status: PostStatus.READY_FOR_CLIENT, label: 'Client review', description: 'Waiting for client approval or changes.' },
  { status: PostStatus.APPROVED, label: 'Approved', description: 'Ready to schedule, then publish.' },
  { status: PostStatus.PUBLISHED, label: 'Published', description: 'Marked as published, with its URL recorded.' },
];

/*
  IN_INTERNAL_REVIEW exists in the API's enum, is accepted as a source status,
  and is never written by anything: internal review is done with staged tasks.
  So it is not a step in the stepper and not a column on the board — a column
  that can never fill is noise. It still has to be *reachable*, in case old
  data holds a post in it, which is what `postBoardFor` is for.
*/
const NEVER_WRITTEN_STATUS = PostStatus.IN_INTERNAL_REVIEW;

/** The stepper step a status belongs to. A scheduled post is an approved post with a date. */
export function postWorkflowStatus(status: PostStatus): PostStatus {
  return status === PostStatus.SCHEDULED ? PostStatus.APPROVED : status;
}

/** Every status, in board order. Same completeness rule as LEAD_PIPELINE. */
export const POST_BOARD: PostStatus[] = [
  PostStatus.DRAFT,
  PostStatus.READY_FOR_CLIENT,
  PostStatus.CHANGES_REQUESTED,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHED,
  PostStatus.CANCELED,
];

type PostBoardMember = (typeof POST_BOARD)[number] | typeof NEVER_WRITTEN_STATUS;
const assertCoversPostStatus: Record<PostStatus, PostBoardMember> = {
  [PostStatus.DRAFT]: PostStatus.DRAFT,
  [PostStatus.IN_INTERNAL_REVIEW]: PostStatus.IN_INTERNAL_REVIEW,
  [PostStatus.READY_FOR_CLIENT]: PostStatus.READY_FOR_CLIENT,
  [PostStatus.CHANGES_REQUESTED]: PostStatus.CHANGES_REQUESTED,
  [PostStatus.APPROVED]: PostStatus.APPROVED,
  [PostStatus.SCHEDULED]: PostStatus.SCHEDULED,
  [PostStatus.PUBLISHED]: PostStatus.PUBLISHED,
  [PostStatus.CANCELED]: PostStatus.CANCELED,
};
void assertCoversPostStatus;

/**
 * What can be done to a post in each status, from the API's state machine:
 * a post is submitted from Draft (or Changes requested), answered by the client
 * from Ready for client, and published once Approved or Scheduled. Offering an
 * action outside its status only earns an INVALID_TRANSITION, so the panel
 * shows what applies and says what the post is waiting on.
 */
export interface PostActions {
  submit: boolean;
  review: boolean;
  publish: boolean;
  /** The planned date can be set any time before the post is closed. */
  plan: boolean;
  /** Where the post stands, for the people doing the work. */
  agencyNote: string;
  /** The same, for the client. */
  clientNote: string;
}

export function postActionsFor(status: PostStatus): PostActions {
  const open = status !== PostStatus.PUBLISHED && status !== PostStatus.CANCELED;
  const notes: Record<PostStatus, { agencyNote: string; clientNote: string }> = {
    [PostStatus.DRAFT]: { agencyNote: 'In preparation. Submit it to the client once the staged work is done.', clientNote: 'Your agency is still preparing this post.' },
    [PostStatus.IN_INTERNAL_REVIEW]: { agencyNote: 'In preparation. Submit it to the client once the staged work is done.', clientNote: 'Your agency is still preparing this post.' },
    [PostStatus.READY_FOR_CLIENT]: { agencyNote: 'With the client. They can approve it, ask for changes or reject it.', clientNote: 'Waiting for your decision: approve it, ask for changes, or reject it.' },
    [PostStatus.CHANGES_REQUESTED]: { agencyNote: 'The client asked for changes. Edit the post, then submit it again.', clientNote: 'You asked for changes. Your agency will send an updated version.' },
    [PostStatus.APPROVED]: { agencyNote: 'Approved by the client. Plan a date, then mark it published once it is live.', clientNote: 'You approved this post. Your agency will schedule and publish it.' },
    [PostStatus.SCHEDULED]: { agencyNote: 'Scheduled. Nothing posts automatically: mark it published once it is live.', clientNote: 'Approved and scheduled. Your agency will publish it.' },
    [PostStatus.PUBLISHED]: { agencyNote: 'Published. This post is a record now.', clientNote: 'This post has been published.' },
    [PostStatus.CANCELED]: { agencyNote: 'Rejected by the client. This post is closed.', clientNote: 'You rejected this post. It is closed.' },
  };
  return {
    submit: status === PostStatus.DRAFT || status === PostStatus.CHANGES_REQUESTED || status === PostStatus.IN_INTERNAL_REVIEW,
    review: status === PostStatus.READY_FOR_CLIENT,
    publish: status === PostStatus.APPROVED || status === PostStatus.SCHEDULED,
    plan: open,
    ...notes[status],
  };
}

/**
 * Statuses a client-only person never sees. The API filters them out of the list
 * and answers 404 for one fetched by id, so none should reach the client app;
 * the client app drops them anyway, so a stale cache or a mis-scoped response
 * cannot show unfinished work, nor leave an always-empty "Draft" column or a
 * "Draft 0" tile that hints at content they cannot see.
 */
export const CLIENT_HIDDEN_STATUSES: readonly PostStatus[] = [PostStatus.DRAFT, PostStatus.IN_INTERNAL_REVIEW];

export function isHiddenFromClient(status: string): boolean {
  return (CLIENT_HIDDEN_STATUSES as readonly string[]).includes(status);
}

/** The posts this viewer may see. Everything, unless they are client-only. */
export function visibleToViewer<T extends { status: string }>(posts: readonly T[], isClient: boolean): T[] {
  return isClient ? posts.filter((post) => !isHiddenFromClient(post.status)) : [...posts];
}

/**
 * Board columns for a set of posts: the working statuses, plus the never-written
 * one only if a post is actually in it. A client-only viewer gets none of the
 * statuses they cannot see.
 */
export function postBoardFor(posts: ReadonlyArray<{ status: string }>, forClient = false): PostStatus[] {
  if (forClient) return POST_BOARD.filter((status) => !isHiddenFromClient(status));
  return posts.some((post) => post.status === NEVER_WRITTEN_STATUS)
    ? [PostStatus.DRAFT, NEVER_WRITTEN_STATUS, ...POST_BOARD.slice(1)]
    : POST_BOARD;
}

/** Every status a post can be grouped under, for lists that hide empty groups anyway. */
export const POST_STATUSES_ALL: PostStatus[] = postBoardFor([{ status: NEVER_WRITTEN_STATUS }]);

/*
  Must cover EVERY value of LeadStatus. A status missing from this array has
  no board column and no summary tile, so leads in it become unreachable from
  the pipeline view — which is exactly what happened to FOLLOW_UP_LATER.

  The exhaustiveness check below turns that into a compile error: if someone
  adds a status to the enum without adding it here, `assertCoversLeadStatus`
  stops type-checking.
*/
export const LEAD_PIPELINE: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.WAITING_DECISION,
  LeadStatus.FOLLOW_UP_LATER,
  LeadStatus.WON,
  LeadStatus.LOST,
];

type LeadPipelineMember = (typeof LEAD_PIPELINE)[number];
// Fails to compile if LeadStatus gains a value that LEAD_PIPELINE omits.
const assertCoversLeadStatus: Record<LeadStatus, LeadPipelineMember> = {
  [LeadStatus.NEW]: LeadStatus.NEW,
  [LeadStatus.CONTACTED]: LeadStatus.CONTACTED,
  [LeadStatus.INTERESTED]: LeadStatus.INTERESTED,
  [LeadStatus.WAITING_DECISION]: LeadStatus.WAITING_DECISION,
  [LeadStatus.FOLLOW_UP_LATER]: LeadStatus.FOLLOW_UP_LATER,
  [LeadStatus.WON]: LeadStatus.WON,
  [LeadStatus.LOST]: LeadStatus.LOST,
};
void assertCoversLeadStatus;

/* Same rule as LEAD_PIPELINE: every TaskStatus needs a column, or tasks in
   the missing status disappear from the board. CANCELED was absent. */
export const TASK_BOARD: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
  TaskStatus.CANCELED,
];

type TaskBoardMember = (typeof TASK_BOARD)[number];
const assertCoversTaskStatus: Record<TaskStatus, TaskBoardMember> = {
  [TaskStatus.TODO]: TaskStatus.TODO,
  [TaskStatus.IN_PROGRESS]: TaskStatus.IN_PROGRESS,
  [TaskStatus.IN_REVIEW]: TaskStatus.IN_REVIEW,
  [TaskStatus.BLOCKED]: TaskStatus.BLOCKED,
  [TaskStatus.DONE]: TaskStatus.DONE,
  [TaskStatus.CANCELED]: TaskStatus.CANCELED,
};
void assertCoversTaskStatus;

export function groupByStatus<T extends { status: string }>(items: T[]): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    acc[item.status] = acc[item.status] ?? [];
    acc[item.status].push(item);
    return acc;
  }, {});
}

export function isOverdue(value?: string | null): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

export function needsPostAction(post: ContentPost): boolean {
  return post.status === PostStatus.READY_FOR_CLIENT
    || post.status === PostStatus.CHANGES_REQUESTED
    || post.status === PostStatus.APPROVED;
}

export function needsLeadAction(lead: Lead): boolean {
  return lead.status === LeadStatus.NEW
    || lead.status === LeadStatus.INTERESTED
    || lead.status === LeadStatus.WAITING_DECISION
    || lead.status === LeadStatus.FOLLOW_UP_LATER;
}

export function needsTaskAction(task: Task): boolean {
  return task.status !== TaskStatus.DONE && task.status !== TaskStatus.CANCELED;
}
