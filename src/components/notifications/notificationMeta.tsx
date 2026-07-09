import type { ReactNode } from 'react';
import type { AppNotification, NotificationType } from '@/types/domain';
import { humanize } from '@/utils/format';

export type NotificationTone = 'task' | 'post' | 'lead' | 'invite' | 'report';

interface NotificationTypeMeta {
  tone: NotificationTone;
  label: string;
  icon: ReactNode;
}

const TYPE_META: Partial<Record<NotificationType, NotificationTypeMeta>> = {
  TASK_ASSIGNED: { tone: 'task', label: 'Task assigned', icon: '✓' },
  TASK_STATUS_CHANGED: { tone: 'task', label: 'Task status changed', icon: '↻' },
  TASK_COMMENTED: { tone: 'task', label: 'Task commented', icon: '💬' },

  POST_SUBMITTED_TO_CLIENT: { tone: 'post', label: 'Post submitted for review', icon: '↗' },
  POST_CHANGES_REQUESTED: { tone: 'post', label: 'Changes requested', icon: '!' },
  POST_APPROVED: { tone: 'post', label: 'Post approved', icon: '✓' },
  POST_PUBLISHED: { tone: 'post', label: 'Post published', icon: '●' },
  POST_COMMENTED: { tone: 'post', label: 'Post commented', icon: '💬' },
  POST_REJECTED: { tone: 'post', label: 'Post rejected', icon: '×' },

  LEAD_ASSIGNED: { tone: 'lead', label: 'Lead assigned', icon: '↦' },
  LEAD_STATUS_CHANGED: { tone: 'lead', label: 'Lead status changed', icon: '↑' },

  INVITATION_CREATED: { tone: 'invite', label: 'Invitation created', icon: '+' },
  INVITATION_ACCEPTED: { tone: 'invite', label: 'Invitation accepted', icon: '✓' },

  REPORT_CREATED: { tone: 'report', label: 'Report created', icon: '◷' },
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
  return TYPE_META[type]?.icon ?? '•';
}

export function notificationTitle(notification: AppNotification): string {
  return notification.title || notificationTypeLabel(notification.type);
}

export function notificationMessage(notification: AppNotification): string {
  return notification.message || notificationTypeLabel(notification.type);
}

export function notificationLink(notification: AppNotification): string | null {
  const entityType = notification.relatedEntityType?.toUpperCase();
  const entityId = notification.relatedEntityId;

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
