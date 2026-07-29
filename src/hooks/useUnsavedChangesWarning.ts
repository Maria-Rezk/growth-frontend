import { useEffect } from 'react';

/**
 * Warns before a tab close, reload or external navigation while a form holds
 * unsaved work.
 *
 * Scope: this only covers the browser leaving the page. It cannot intercept
 * in-app <Link> navigation — react-router's `useBlocker` requires a data
 * router (createBrowserRouter), and this app mounts <BrowserRouter>. If
 * in-app protection becomes necessary, migrate the router rather than
 * reaching for a history hack.
 *
 * The message string is ignored by every current browser; they show their own
 * generic text. Returning a value is still required to trigger the prompt.
 */
export function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled]);
}
