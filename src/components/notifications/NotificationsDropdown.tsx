import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useNotifications } from '@/context/NotificationsContext';
import { notificationsService } from '@/services/notifications';
import type { AppNotification } from '@/types/domain';
import { BellIcon } from '@/components/ui/icons';
import { NotificationItem } from './NotificationItem';
import { notificationLink } from './notificationMeta';

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useAsync(() => notificationsService.list(), [open]);
  const markRead = useMutation(notificationsService.markRead);
  const markAll = useMutation(notificationsService.markAllRead);

  const recentItems = useMemo(() => (list.data ?? []).slice(0, 6), [list.data]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markRead.mutate(notification.id);
      await refreshUnreadCount();
    }

    setOpen(false);
    navigate(notificationLink(notification) ?? '/notifications');
  };

  const handleMarkAll = async () => {
    const done = await markAll.mutate();
    if (done !== null) {
      await Promise.all([list.refetch(), refreshUnreadCount()]);
    }
  };

  return (
    <div className="notifications-dropdown" ref={ref}>
      <button
        className="icon-button"
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon size={18} />
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notifications-panel" role="menu" aria-label="Recent notifications">
          <div className="notifications-panel__header">
            <div>
              <strong>Notifications</strong>
              <p>{unreadCount > 0 ? `${unreadCount} unread` : 'You are caught up'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleMarkAll} loading={markAll.loading}>Mark all read</Button>
          </div>

          <div className="notifications-panel__body">
            {list.loading ? <p className="muted">Loading notifications…</p> : null}
            {list.error ? <p className="error-text">{list.error}</p> : null}
            {!list.loading && !list.error && recentItems.length === 0 ? <p className="muted">No notifications yet.</p> : null}
            {recentItems.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} compact onSelect={handleSelect} />
            ))}
          </div>

          <button
            type="button"
            className="notifications-panel__footer"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
}
