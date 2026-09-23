import { useEffect } from 'react';
import toast from 'react-hot-toast';

const TOAST_ID = 'network-status';

/**
 * Tells the person when the network drops and when it comes back, instead of
 * mutations and queries just quietly starting to fail.
 *
 * No visual output of its own — one `<Toaster>` already renders every toast
 * (see `ThemedToaster`). Sharing `TOAST_ID` means "back online" replaces the
 * "you're offline" toast in place rather than stacking a second one.
 */
export function NetworkStatusToast() {
  useEffect(() => {
    const goOffline = () => {
      toast.error('You are offline. Unsaved work stays in your drafts until you reconnect.', {
        id: TOAST_ID,
        duration: Infinity,
      });
    };
    const goOnline = () => {
      toast.success('Back online.', { id: TOAST_ID, duration: 3000 });
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (!navigator.onLine) goOffline();

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return null;
}
