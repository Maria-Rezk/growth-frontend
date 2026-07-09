import { Link } from 'react-router-dom';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { notificationsService } from '@/services/notifications';
import { useNotifications } from '@/context/NotificationsContext';
import { Button } from '@/components/ui/Button';
import { formatDateTime, humanize } from '@/utils/format';

export function NotificationsMenu({ open }: { open: boolean }) {
  const { refreshUnreadCount } = useNotifications();
  const list = useAsync(() => notificationsService.list(), [open]);
  const markAll = useMutation(notificationsService.markAllRead);

  if (!open) return null;

  const handleMarkAll = async () => {
    const done = await markAll.mutate();
    if (done !== null) {
      await Promise.all([list.refetch(), refreshUnreadCount()]);
    }
  };

  return (
    <div className="notifications-menu">
      <div className="notifications-menu__header">
        <strong>Notifications</strong>
        <Button variant="ghost" size="sm" onClick={handleMarkAll} loading={markAll.loading}>Mark all read</Button>
      </div>
      <div className="notifications-menu__body">
        {list.loading ? <p className="muted">Loading…</p> : null}
        {list.error ? <p className="error-text">{list.error}</p> : null}
        {list.data?.slice(0, 6).map((item) => (
          <Link key={item.id} to="/notifications" className={item.readAt ? 'notification-row' : 'notification-row notification-row--unread'}>
            <strong>{item.title ?? humanize(item.type)}</strong>
            <p>{item.message ?? humanize(item.type)}</p>
            <time>{formatDateTime(item.createdAt)}</time>
          </Link>
        ))}
        {list.data?.length === 0 ? <p className="muted">No notifications.</p> : null}
      </div>
      <Link to="/notifications" className="notifications-menu__footer">View all notifications</Link>
    </div>
  );
}
