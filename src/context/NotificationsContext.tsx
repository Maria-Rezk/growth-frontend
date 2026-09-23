import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/lib/queryClient';
import { readStored, writeStored } from '@/lib/storage';
import type { AppNotification, NotificationType } from '@/types/domain';

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  /** Types the person has switched off. Muted ones never reach the bell, the dropdown or the page. */
  muted: ReadonlySet<NotificationType>;
  setMuted: (type: NotificationType, muted: boolean) => void;
  /** `true` for a notification the person wants to see. */
  isVisible: (notification: AppNotification) => boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/*
  Preferences are per device until the backend has a preferences endpoint:
  the API has no field for them yet, and inventing a server shape here would
  be a guess. When it lands, `readMuted` / `writeMuted` become one call each
  and nothing above them changes.

  Keyed by user id — a device-level preference is only correct for one device
  used by one person. A shared browser signing a second person in must not
  hand them the first person's mutes (or silence a notification type for
  them without their say), so each account gets its own record.
*/
const MUTED_VERSION = 1;
const mutedKeyFor = (userId: string) => `growth.notifications.muted.${userId}`;

/** Exported for testing per-user isolation directly, without mounting the whole provider tree. */
export function readMuted(userId: string | null): Set<NotificationType> {
  if (!userId) return new Set();
  const stored = readStored<unknown>('local', mutedKeyFor(userId), MUTED_VERSION);
  const parsed = stored?.data;
  return new Set(Array.isArray(parsed) ? (parsed.filter((item) => typeof item === 'string') as NotificationType[]) : []);
}

export function writeMuted(userId: string | null, muted: Set<NotificationType>): void {
  if (!userId) return;
  writeStored('local', mutedKeyFor(userId), MUTED_VERSION, [...muted]);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  // Re-reads whenever the signed-in user changes — this provider stays
  // mounted across a same-tab account switch that doesn't unmount the shell.
  const [muted, setMutedState] = useState<Set<NotificationType>>(() => readMuted(userId));

  useEffect(() => {
    setMutedState(readMuted(userId));
  }, [userId]);

  useEffect(() => {
    if (userId) writeMuted(userId, muted);
  }, [muted, userId]);

  const { data: serverCount } = useQuery({
    queryKey: queryKeys.unreadNotifications,
    queryFn: () => notificationsService.unreadCount(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  /*
    The server's unread count knows nothing about mutes. Once anything is
    muted the badge is counted from the list instead, so a muted type never
    lights the bell for something the person will not see when they open it.
  */
  const { data: list } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => notificationsService.list(),
    enabled: muted.size > 0,
    refetchInterval: muted.size > 0 ? 60_000 : false,
  });

  const isVisible = useCallback((notification: AppNotification) => !muted.has(notification.type), [muted]);

  const unreadCount = muted.size > 0 && list
    ? list.filter((notification) => !notification.readAt && isVisible(notification)).length
    : serverCount ?? 0;

  const refreshUnreadCount = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifications }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    ]);
  }, [queryClient]);

  const setMuted = useCallback((type: NotificationType, value: boolean) => {
    setMutedState((current) => {
      const next = new Set(current);
      if (value) next.add(type);
      else next.delete(type);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount, muted, setMuted, isVisible }),
    [isVisible, muted, refreshUnreadCount, setMuted, unreadCount],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}
