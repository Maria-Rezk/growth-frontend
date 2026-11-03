import { createContext, useContext } from 'react';
import type { NotificationPreferences, NotificationType } from '@/types/domain';

/*
  The notifications context and its hook, apart from NotificationsProvider (F-31): a
  module that exports only components keeps its state across Fast Refresh.
  Everything that reads the context imports from here, as before.
*/

export interface NotificationsContextValue {
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

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}
