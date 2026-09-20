import type { ReactNode } from 'react';
import type { AppNotification, NotificationType } from '@/types/domain';
import { humanize } from '@/utils/format';
import {
  AlertIcon,
  ArrowUpRightIcon,
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
