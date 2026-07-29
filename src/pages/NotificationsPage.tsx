import { useMemo, useState } from 'react';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { notificationsService } from '@/services/notifications';
import { queryKeys } from '@/lib/queryClient';
import type { AppNotification, NotificationType } from '@/types/domain';
import { NotificationFilters, type NotificationFiltersValue } from '@/components/notifications/NotificationFilters';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { notificationMessage, notificationTitle } from '@/components/notifications/notificationMeta';

const DEFAULT_FILTERS: NotificationFiltersValue = {
  readStatus: 'ALL',
  type: 'ALL',
  search: '',
};

function matchesFilters(notification: AppNotification, filters: NotificationFiltersValue) {
  if (filters.readStatus === 'UNREAD' && notification.readAt) return false;
  if (filters.readStatus === 'READ' && !notification.readAt) return false;
  if (filters.type !== 'ALL' && notification.type !== filters.type) return false;

  const search = filters.search.trim().toLowerCase();
  if (!search) return true;

  return [
    notificationTitle(notification),
    notificationMessage(notification),
    notification.type,
    notification.relatedEntityType,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

const INVALIDATE_NOTIFICATIONS = [queryKeys.notifications, queryKeys.unreadNotifications];

export function NotificationsPage() {
  const notifications = useAsync(() => notificationsService.list(), [], { queryKey: queryKeys.notifications });
  const markRead = useMutation(notificationsService.markRead, { invalidateKeys: INVALIDATE_NOTIFICATIONS });
  const markAll = useMutation(notificationsService.markAllRead, { invalidateKeys: INVALIDATE_NOTIFICATIONS });
  const [filters, setFilters] = useState<NotificationFiltersValue>(DEFAULT_FILTERS);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const markOne = async (id: string) => {
    setPendingId(id);
    try {
      await markRead.mutate(id);
    } finally {
      setPendingId(null);
    }
  };

  const notificationTypes = useMemo<NotificationType[]>(() => {
    const types = new Set((notifications.data ?? []).map((notification) => notification.type));
    return Array.from(types).sort();
  }, [notifications.data]);

  const filteredNotifications = useMemo(
    () => (notifications.data ?? []).filter((notification) => matchesFilters(notification, filters)),
    [filters, notifications.data],
  );

  const unreadCount = useMemo(
    () => (notifications.data ?? []).filter((notification) => !notification.readAt).length,
    [notifications.data],
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="System events from tasks, leads, approvals, invitations and reports."
        action={(
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAll.mutate()}
            loading={markAll.loading}
            disabled={unreadCount === 0}
          >
            Mark all read
          </Button>
        )}
      />

      <div className="notification-summary-grid">
        <Card className="metric-card">
          <span>Total</span>
          <strong>{notifications.loading ? '—' : notifications.data?.length ?? 0}</strong>
        </Card>
        <Card className="metric-card metric-card--accent">
          <span>Unread</span>
          <strong>{notifications.loading ? '—' : unreadCount}</strong>
        </Card>
        <Card className="metric-card">
          <span>Matching filters</span>
          <strong>{notifications.loading ? '—' : filteredNotifications.length}</strong>
        </Card>
      </div>

      <NotificationFilters value={filters} notificationTypes={notificationTypes} onChange={setFilters} />

      <Card className="notifications-list-card">
        {notifications.loading ? <LoadingState label="Loading notifications…" /> : null}
        {notifications.error ? (
          <ErrorState message={notifications.error} onRetry={notifications.refetch} />
        ) : null}
        {markRead.error ? <p className="error-box" role="alert">{markRead.error}</p> : null}
        {markAll.error ? <p className="error-box" role="alert">{markAll.error}</p> : null}
        {!notifications.loading && !notifications.error && filteredNotifications.length === 0 ? (
          <EmptyState title="No notifications found" description="Try changing the filters or clearing the search field." />
        ) : null}
        {filteredNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            action={!notification.readAt ? (
              <Button
                variant="secondary"
                size="sm"
                /* Per-item, not markRead.loading — a shared boolean put a
                   spinner on every unread row at once. */
                loading={pendingId === notification.id}
                disabled={pendingId !== null}
                onClick={() => markOne(notification.id)}
              >
                Mark read
              </Button>
            ) : null}
          />
        ))}
      </Card>
    </>
  );
}