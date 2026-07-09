import { LeadStatus, PostStatus, TaskStatus, type ContentPost, type Lead, type Task } from '@/types/domain';

export const POST_WORKFLOW: Array<{ status: PostStatus; label: string; description: string }> = [
  { status: PostStatus.DRAFT, label: 'Draft', description: 'Caption and brief still being prepared.' },
  { status: PostStatus.IN_INTERNAL_REVIEW, label: 'Internal review', description: 'Agency team checks copy and assets.' },
  { status: PostStatus.READY_FOR_CLIENT, label: 'Client review', description: 'Waiting for client approval or changes.' },
  { status: PostStatus.APPROVED, label: 'Approved', description: 'Ready to schedule or publish.' },
  { status: PostStatus.PUBLISHED, label: 'Published', description: 'Live and ready for reporting.' },
];

export const LEAD_PIPELINE: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.WAITING_DECISION,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export const TASK_BOARD: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
  TaskStatus.DONE,
];

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
