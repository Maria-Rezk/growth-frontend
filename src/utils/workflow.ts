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
  { status: PostStatus.DRAFT, label: 'Draft', description: 'Caption and brief still being prepared.' },
  { status: PostStatus.IN_INTERNAL_REVIEW, label: 'Internal review', description: 'Agency team checks copy and assets.' },
  { status: PostStatus.READY_FOR_CLIENT, label: 'Client review', description: 'Waiting for client approval or changes.' },
  { status: PostStatus.APPROVED, label: 'Approved', description: 'Ready to schedule or publish.' },
  { status: PostStatus.PUBLISHED, label: 'Published', description: 'Live and ready for reporting.' },
];

/** Every status, in board order. Same completeness rule as LEAD_PIPELINE. */
export const POST_BOARD: PostStatus[] = [
  PostStatus.DRAFT,
  PostStatus.IN_INTERNAL_REVIEW,
  PostStatus.READY_FOR_CLIENT,
  PostStatus.CHANGES_REQUESTED,
  PostStatus.APPROVED,
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHED,
  PostStatus.CANCELED,
];

type PostBoardMember = (typeof POST_BOARD)[number];
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
