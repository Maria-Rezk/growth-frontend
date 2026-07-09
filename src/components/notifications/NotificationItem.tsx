import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { AppNotification } from '@/types/domain';
import { formatDateTime } from '@/utils/format';
import {
  notificationIcon,
  notificationMessage,
  notificationTitle,
  notificationTone,
  notificationToneLabel,
} from './notificationMeta';

interface NotificationItemProps {
  notification: AppNotification;
  compact?: boolean;
  onSelect?: (notification: AppNotification) => void;
  action?: ReactNode;
}

export function NotificationItem({ notification, compact = false, onSelect, action }: NotificationItemProps) {
  const unread = !notification.readAt;
  const tone = notificationTone(notification.type);

  return (
    <article
      className={clsx('notification-item', `notification-item--${tone}`, unread && 'notification-item--unread', compact && 'notification-item--compact')}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(notification)}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(notification);
        }
      }}
      aria-label={`${notificationTitle(notification)}${unread ? ', unread' : ''}`}
    >
      <span className="notification-item__icon" aria-hidden="true">
        {notificationIcon(notification.type)}
      </span>

      <div className="notification-item__body">
        <div className="notification-item__meta">
          <span>{notificationToneLabel(notification.type)}</span>
          {unread ? <span className="notification-item__dot" aria-label="Unread" /> : null}
        </div>
        <strong>{notificationTitle(notification)}</strong>
        <p>{notificationMessage(notification)}</p>
        <time>{formatDateTime(notification.createdAt)}</time>
      </div>

      {action ? <div className="notification-item__action" onClick={(event) => event.stopPropagation()}>{action}</div> : null}
    </article>
  );
}
