import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoNotifications } from '@/services/demoStore';
import type { AppNotification } from '@/types/domain';

/**
 * The task-approval notifications name their target as `entityType` /
 * `entityId`, older ones as `relatedEntityType` / `relatedEntityId`. Fold
 * both into the `related*` pair so every reader sees one spelling.
 */
function normalizeNotification(raw: AppNotification): AppNotification {
  return {
    ...raw,
    relatedEntityType: raw.relatedEntityType ?? raw.entityType,
    relatedEntityId: raw.relatedEntityId ?? raw.entityId,
  };
}

export const notificationsService = {
  async list(): Promise<AppNotification[]> {
    if (env.demoMode) return demoDelay(demoNotifications);
    const response = await http.get(apiRoutes.notifications.list);
    return unwrap<AppNotification[]>(response.data).map(normalizeNotification);
  },
  async unreadCount(): Promise<number> {
    if (env.demoMode) return demoDelay(demoNotifications.filter((notification) => !notification.readAt).length);
    const response = await http.get(apiRoutes.notifications.unreadCount);
    const data = unwrap<{ unreadCount?: number; count?: number } | number>(response.data);
    if (typeof data === 'number') return data;
    return data.unreadCount ?? data.count ?? 0;
  },
  async markRead(notificationId: string): Promise<void> {
    if (env.demoMode) {
      const notification = demoNotifications.find((item) => item.id === notificationId);
      if (notification) notification.readAt = new Date().toISOString();
      return demoDelay(undefined);
    }
    await http.patch(apiRoutes.notifications.markRead(notificationId));
  },
  async markAllRead(): Promise<void> {
    if (env.demoMode) {
      demoNotifications.forEach((notification) => { notification.readAt = notification.readAt ?? new Date().toISOString(); });
      return demoDelay(undefined);
    }
    await http.patch(apiRoutes.notifications.markAllRead);
  },
};
