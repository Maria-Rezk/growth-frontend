import { useCallback, useEffect, useRef } from 'react';

/** How often the notification feed is refreshed while somebody is using the app. */
export const NOTIFICATION_POLL_MS = 30_000;

/**
 * Two triggers this close together are one refresh: returning to a tab often
 * fires `visibilitychange` and `focus` and, after sleep, `online` within
 * milliseconds of each other.
 */
export const NOTIFICATION_MIN_GAP_MS = 2_000;

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Keeps the notification feed — the list and the unread count together —
 * current without a page reload.
 *
 * - Every {@link NOTIFICATION_POLL_MS} while the tab is visible and online.
 *   A hidden tab or an offline machine makes no requests at all.
 * - At once when the tab becomes visible again, or the connection comes back.
 * - Never while `enabled` is false (signed out): every listener and timer is
 *   removed.
 *
 * `refresh` must refetch every feed query in one go. Calls are coalesced: a
 * refresh already in flight is shared, and one that finished less than
 * {@link NOTIFICATION_MIN_GAP_MS} ago is not repeated.
 *
 * Returns `refreshNow` for an explicit trigger (opening the bell). It obeys
 * the in-flight rule but not the gap, because somebody asked for it.
 */
export function useNotificationSync(enabled: boolean, refresh: () => Promise<void>): () => Promise<void> {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const inFlight = useRef<Promise<void> | null>(null);
  const lastDone = useRef(0);

  const run = useCallback((force: boolean): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (!force && Date.now() - lastDone.current < NOTIFICATION_MIN_GAP_MS) return Promise.resolve();
    const pending = refreshRef.current()
      // A failed poll is not the user's problem: the next tick tries again, and
      // the queries keep the last good data on screen meanwhile.
      .catch(() => undefined)
      .finally(() => {
        lastDone.current = Date.now();
        inFlight.current = null;
      });
    inFlight.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => {
      if (isVisible() && isOnline()) void run(false);
    };
    const onVisibility = () => {
      if (isVisible()) tick();
    };

    const timer = window.setInterval(tick, NOTIFICATION_POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', tick);
    };
  }, [enabled, run]);

  return useCallback(() => (enabled ? run(true) : Promise.resolve()), [enabled, run]);
}
