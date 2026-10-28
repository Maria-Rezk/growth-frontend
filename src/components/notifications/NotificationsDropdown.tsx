import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { useNotifications } from '@/context/NotificationsContext';
import { notificationsService } from '@/services/notifications';
import { queryKeys } from '@/lib/queryClient';
import type { AppNotification } from '@/types/domain';
import { BellIcon } from '@/components/ui/icons';
import { NotificationItem } from './NotificationItem';
import { useOpenNotification } from './useOpenNotification';

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  /*
    Shares `queryKeys.notifications` with the full Notifications page and
    NotificationsContext — it used to key on its own `factory.toString()`
    fallback, a private cache that neither of those invalidated. Marking
    something read on the full page (or from here) left the dropdown showing
    the old unread state until it happened to go stale on its own.
  */
  const list = useAsync(() => notificationsService.list(), [], { queryKey: queryKeys.notifications });
  const markAll = useMutation(notificationsService.markAllRead);

  const recentItems = useMemo(() => (list.data ?? []).slice(0, 6), [list.data]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Closing must not strand focus on a panel that is about to disappear.
      const focusInside = Boolean(ref.current?.contains(document.activeElement));
      setOpen(false);
      if (focusInside) bellRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /*
    A disclosure, not a menu: the panel holds a heading, buttons and a list,
    which `role="menu"` (menu items and arrow keys only) cannot describe. On
    open, focus moves into the labelled panel so a screen reader announces it
    and Tab walks its controls in order.
  */
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const openNotification = useOpenNotification();
  const handleSelect = async (notification: AppNotification) => {
    setOpen(false);
    await openNotification(notification);
  };

  const handleMarkAll = async () => {
    const done = await markAll.mutate();
    if (done !== null) {
      await Promise.all([list.refetch(), refreshUnreadCount()]);
    }
  };

  return (
    <div
      className="notifications-dropdown"
      ref={ref}
      // Tabbing out of the panel closes it, so it never stays open behind the
      // keyboard user. A click elsewhere is handled by the mousedown listener.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={bellRef}
        className="icon-button"
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon size={18} />
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      {open ? (
        <section ref={panelRef} id={panelId} className="notifications-panel" aria-label="Recent notifications" tabIndex={-1}>
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
        </section>
      ) : null}
    </div>
  );
}
