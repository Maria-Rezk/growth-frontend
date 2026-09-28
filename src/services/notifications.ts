import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import { demoDelay, demoNotificationPreferences, demoNotifications } from '@/services/demoStore';
import type { AppNotification, NotificationPreferences, NotificationType } from '@/types/domain';

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

function demoVisible(notification: AppNotification) {
  return !demoNotificationPreferences.mutedTypes.includes(notification.type);
}

function normalizePreferences(raw: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return {
    mutedTypes: Array.isArray(raw?.mutedTypes) ? raw.mutedTypes.filter((type): type is NotificationType => typeof type === 'string') : [],
    // A never-saved user gets the digest; only an explicit false turns it off.
    emailDigest: raw?.emailDigest !== false,
  };
}

export const notificationsService = {
  /** Muted types are excluded server-side unless `includeMuted` is set. */
  async list(options?: { includeMuted?: boolean }): Promise<AppNotification[]> {
    if (env.demoMode) return demoDelay(options?.includeMuted ? demoNotifications : demoNotifications.filter(demoVisible));
    const response = await http.get(apiRoutes.notifications.list, {
      params: options?.includeMuted ? { includeMuted: true } : undefined,
    });
    return unwrap<AppNotification[]>(response.data).map(normalizeNotification);
  },
  /** Already excludes muted types. */
  async unreadCount(): Promise<number> {
    if (env.demoMode) return demoDelay(demoNotifications.filter((notification) => !notification.readAt && demoVisible(notification)).length);
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
  async getPreferences(): Promise<NotificationPreferences> {
    if (env.demoMode) return demoDelay(normalizePreferences(demoNotificationPreferences));
    const response = await http.get(apiRoutes.me.notificationPreferences);
    return normalizePreferences(unwrap<Partial<NotificationPreferences>>(response.data));
  },
  /** PUT replaces the whole object — always send both keys. An unknown type is a 400. */
  async updatePreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const body: NotificationPreferences = { mutedTypes: [...new Set(preferences.mutedTypes)], emailDigest: preferences.emailDigest };
    if (env.demoMode) {
      Object.assign(demoNotificationPreferences, body);
      return demoDelay(normalizePreferences(demoNotificationPreferences));
    }
    const response = await http.put(apiRoutes.me.notificationPreferences, body);
    return normalizePreferences(unwrap<Partial<NotificationPreferences>>(response.data));
  },
};
