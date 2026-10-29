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

/*
  Structure (A-2). The item is a plain article; opening it is the title, a
  real button, and "Mark read" is its own button beside it. Before, the whole
  article was role="button" with an aria-label: the label replaced the
  message, time and type for screen readers, and a button's children are
  presentational, so the Mark read button inside it was hidden from them
  while still taking focus.

  A click anywhere on the card still opens it: the title button's ::after
  covers the card, and the action sits above that layer, so the two never
  both fire and no handler needs to stop propagation.
*/
export function NotificationItem({ notification, compact = false, onSelect, action }: NotificationItemProps) {
  const unread = !notification.readAt;
  const tone = notificationTone(notification.type);
  const title = notificationTitle(notification);

  return (
    <article
      className={clsx('notification-item', `notification-item--${tone}`, unread && 'notification-item--unread', compact && 'notification-item--compact', onSelect && 'notification-item--openable')}
    >
      <span className="notification-item__icon" aria-hidden="true">
        {notificationIcon(notification.type)}
      </span>

      <div className="notification-item__body">
        <div className="notification-item__meta">
          <span>{notificationToneLabel(notification.type)}</span>
          {/* Said by the title button's name when there is one; otherwise said here. */}
          {unread ? <span className="notification-item__dot" {...(onSelect ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Unread' })} /> : null}
        </div>
        {onSelect ? (
          <button type="button" className="notification-item__open" aria-label={`${title}${unread ? ', unread' : ''}`} onClick={() => onSelect(notification)}>
            {title}
          </button>
        ) : (
          <strong>{title}</strong>
        )}
        <p>{notificationMessage(notification)}</p>
        <time dateTime={notification.createdAt}>{formatDateTime(notification.createdAt)}</time>
      </div>

      {action ? <div className="notification-item__action">{action}</div> : null}
    </article>
  );
}
