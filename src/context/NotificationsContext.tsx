import { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications';
import { queryKeys } from '@/lib/queryClient';

interface NotificationsContextValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.unreadNotifications,
    queryFn: () => notificationsService.unreadCount(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const unreadCount = data ?? 0;

  // Kept for API compatibility; now just invalidates the cached count.
  const refreshUnreadCount = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifications });
  }, [queryClient]);

  const value = useMemo(() => ({ unreadCount, refreshUnreadCount }), [refreshUnreadCount, unreadCount]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}