import { createContext, useCallback, useContext, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications';
import { useAuth } from '@/context/AuthContext';
import { errorMessage } from '@/lib/http';
import { queryKeys } from '@/lib/queryClient';
import type { NotificationPreferences, NotificationType } from '@/types/domain';

const NOTHING_MUTED: ReadonlySet<NotificationType> = new Set();

interface NotificationsContextValue {
  /** From the server, which already leaves muted types out. */
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  /** Types switched off on the account. */
  muted: ReadonlySet<NotificationType>;
  setMuted: (type: NotificationType, muted: boolean) => void;
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  preferencesError: string | null;
  /** Replaces the whole preferences object. Optimistic; rolls back on failure. */
  savePreferences: (next: NotificationPreferences) => Promise<boolean>;
  saving: boolean;
  saveError: string | null;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = Boolean(user?.id);

  const { data: serverCount } = useQuery({
    queryKey: queryKeys.unreadNotifications,
    queryFn: () => notificationsService.unreadCount(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    enabled: signedIn,
  });

  const preferencesQuery = useQuery({
    queryKey: queryKeys.notificationPreferences(user?.id ?? ''),
    queryFn: () => notificationsService.getPreferences(),
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (next: NotificationPreferences) => notificationsService.updatePreferences(next),
    onMutate: async (next) => {
      const key = queryKeys.notificationPreferences(user?.id ?? '');
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notificationPreferences(user?.id ?? ''), context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.notificationPreferences(user?.id ?? ''), saved);
      // The list and the count both depend on what is muted.
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });

  const refreshUnreadCount = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  }, [queryClient]);

  const { mutateAsync } = saveMutation;
  const savePreferences = useCallback(async (next: NotificationPreferences) => {
    try {
      await mutateAsync(next);
      return true;
    } catch {
      return false;
    }
  }, [mutateAsync]);

  const preferences = preferencesQuery.data ?? null;
  const muted = useMemo(() => (preferences ? new Set(preferences.mutedTypes) : NOTHING_MUTED), [preferences]);

  const setMuted = useCallback((type: NotificationType, value: boolean) => {
    if (!preferences) return;
    const next = new Set(preferences.mutedTypes);
    if (value) next.add(type);
    else next.delete(type);
    void savePreferences({ ...preferences, mutedTypes: [...next] });
  }, [preferences, savePreferences]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount: serverCount ?? 0,
      refreshUnreadCount,
      muted,
      setMuted,
      preferences,
      preferencesLoading: preferencesQuery.isLoading,
      preferencesError: preferencesQuery.error ? errorMessage(preferencesQuery.error) : null,
      savePreferences,
      saving: saveMutation.isPending,
      saveError: saveMutation.error ? errorMessage(saveMutation.error) : null,
    }),
    [muted, preferences, preferencesQuery.error, preferencesQuery.isLoading, refreshUnreadCount, saveMutation.error, saveMutation.isPending, savePreferences, serverCount, setMuted],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}
