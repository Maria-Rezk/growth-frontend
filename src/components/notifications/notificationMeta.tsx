import type { ReactNode } from 'react';
import type { AppNotification, NotificationType } from '@/types/domain';
import { humanize } from '@/utils/format';
import {
  AlertIcon,
  ArrowUpRightIcon,
  BoltIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  DotIcon,
  GlobeIcon,
  LeadIcon,
  MessageIcon,
  PlusIcon,
  RefreshIcon,
  TrendUpIcon,
} from '@/components/ui/icons';

export type NotificationTone = 'task' | 'post' | 'lead' | 'invite' | 'report';

interface NotificationTypeMeta {
  tone: NotificationTone;
  label: string;
  icon: ReactNode;
}

const ICON_SIZE = 16;

const TYPE_META: Partial<Record<NotificationType, NotificationTypeMeta>> = {
  TASK_ASSIGNED: { tone: 'task', label: 'Task assigned', icon: <CheckIcon size={ICON_SIZE} /> },
  TASK_STATUS_CHANGED: { tone: 'task', label: 'Task status changed', icon: <RefreshIcon size={ICON_SIZE} /> },
  TASK_COMMENTED: { tone: 'task', label: 'Task commented', icon: <MessageIcon size={ICON_SIZE} /> },
  // The internal approval gate. Submitted goes to the approver; the two verdicts go to the assignee.
  TASK_SUBMITTED_FOR_REVIEW: { tone: 'task', label: 'Waiting for your review', icon: <ClockIcon size={ICON_SIZE} /> },
  TASK_APPROVED: { tone: 'task', label: 'Task approved', icon: <CheckIcon size={ICON_SIZE} /> },
  TASK_CHANGES_REQUESTED: { tone: 'task', label: 'Changes requested on a task', icon: <AlertIcon size={ICON_SIZE} /> },
  // The first time a task moves to In progress. Goes to whoever supervises that area, or the approver.
  TASK_STARTED: { tone: 'task', label: 'Work has started', icon: <BoltIcon size={ICON_SIZE} /> },
  REVIEW_WAITING_24H: { tone: 'task', label: 'A review has waited a day', icon: <ClockIcon size={ICON_SIZE} /> },
  REVIEW_WAITING_48H: { tone: 'task', label: 'A review has waited two days', icon: <AlertIcon size={ICON_SIZE} /> },

  POST_SUBMITTED_TO_CLIENT: { tone: 'post', label: 'Post submitted for review', icon: <ArrowUpRightIcon size={ICON_SIZE} /> },
  POST_CHANGES_REQUESTED: { tone: 'post', label: 'Changes requested', icon: <AlertIcon size={ICON_SIZE} /> },
  POST_APPROVED: { tone: 'post', label: 'Post approved', icon: <CheckIcon size={ICON_SIZE} /> },
  POST_PUBLISHED: { tone: 'post', label: 'Post published', icon: <GlobeIcon size={ICON_SIZE} /> },
  POST_COMMENTED: { tone: 'post', label: 'Post commented', icon: <MessageIcon size={ICON_SIZE} /> },
  POST_REJECTED: { tone: 'post', label: 'Post rejected', icon: <CloseIcon size={ICON_SIZE} /> },

  LEAD_ASSIGNED: { tone: 'lead', label: 'Lead assigned', icon: <LeadIcon size={ICON_SIZE} /> },
  LEAD_STATUS_CHANGED: { tone: 'lead', label: 'Lead status changed', icon: <TrendUpIcon size={ICON_SIZE} /> },
  LEAD_NOTE_ADDED: { tone: 'lead', label: 'Lead note added', icon: <LeadIcon size={ICON_SIZE} /> },

  INVITATION_CREATED: { tone: 'invite', label: 'Invitation created', icon: <PlusIcon size={ICON_SIZE} /> },
  INVITATION_ACCEPTED: { tone: 'invite', label: 'Invitation accepted', icon: <CheckIcon size={ICON_SIZE} /> },

  REPORT_CREATED: { tone: 'report', label: 'Report created', icon: <ClockIcon size={ICON_SIZE} /> },
};

const TONE_LABELS: Record<NotificationTone, string> = {
  task: 'Task',
  post: 'Content',
  lead: 'Lead',
  invite: 'Members',
  report: 'Report',
};

/** Every type the app knows how to label, grouped — the rows of the preferences card. */
export const NOTIFICATION_TYPES = Object.keys(TYPE_META) as NotificationType[];

export function notificationTypeLabel(type: NotificationType): string {
  return TYPE_META[type]?.label ?? humanize(type);
}

export function notificationTone(type: NotificationType): NotificationTone {
  return TYPE_META[type]?.tone ?? 'report';
}

export function notificationToneLabel(type: NotificationType): string {
  return TONE_LABELS[notificationTone(type)];
}

export function notificationIcon(type: NotificationType): ReactNode {
  return TYPE_META[type]?.icon ?? <DotIcon size={ICON_SIZE} />;
}

export function notificationTitle(notification: AppNotification): string {
  return notification.title || notificationTypeLabel(notification.type);
}

export function notificationMessage(notification: AppNotification): string {
  return notification.message || notificationTypeLabel(notification.type);
}

export function notificationLink(notification: AppNotification): string | null {
  // Newer notifications spell the target `entityType` / `entityId`; older ones `related*`. Both deep-link.
  const entityType = (notification.relatedEntityType ?? notification.entityType)?.toUpperCase();
  const entityId = notification.relatedEntityId ?? notification.entityId;

  if (!entityType || !entityId) return null;

  switch (entityType) {
    case 'TASK':
    case 'TASKS':
      return `/tasks/${entityId}`;
    case 'POST':
    case 'CONTENT_POST':
    case 'CONTENT_POSTS':
      return `/posts/${entityId}`;
    case 'LEAD':
    case 'LEADS':
      return `/leads/${entityId}`;
    case 'REPORT':
    case 'REPORTS':
      return `/reports/${entityId}`;
    case 'INVITATION':
    case 'MEMBERSHIP':
    case 'MEMBER':
      return '/members';
    default:
      return null;
  }
}

/** The people around a notification, in words (parallel-steps guide 2). Every part is optional. */
export interface NotificationContext {
  /** The task as it is now: its title and live status. */
  task?: { title: string; status: string };
  /** Who did it. Absent for reminders and older notifications. */
  actor?: string;
  /** Who has the task now: everybody on the live step still working, else the assignee. */
  withNames: string[];
  /** Who created the task, when it is somebody other than the actor. */
  createdBy?: string;
}

const personName = (person?: { fullName?: string | null } | null) => person?.fullName?.trim() || undefined;

export function notificationContext(notification: AppNotification): NotificationContext {
  const actor = personName(notification.actionBy);
  const creator = personName(notification.createdBy);
  const closed = notification.task?.status === 'DONE' || notification.task?.status === 'CANCELED';
  // "Now with" names people still working. Somebody who handed in, or a step with its
  // approver, is not "with" them — the task's status badge already says "In review".
  const isWorking = (status?: string | null) => !status || status === 'TODO' || status === 'IN_PROGRESS' || status === 'BLOCKED';
  const current = notification.currentAssignees ?? [];
  const people = current.length ? current.filter((person) => isWorking(person.status)) : notification.assignedTo ? [notification.assignedTo] : [];
  const withNames = closed ? [] : people.map(personName).filter((name): name is string => Boolean(name));
  return {
    task: notification.task ? { title: notification.task.title, status: notification.task.status } : undefined,
    actor,
    withNames,
    createdBy: creator && creator !== actor ? creator : undefined,
  };
}
