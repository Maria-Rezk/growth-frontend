import { useEffect } from 'react';
import { env } from '@/config/env';

/**
 * "Tasks · Solu1ions Growth OS" in the browser tab.
 *
 * Every page used to share one title, so five open tabs of the app were
 * indistinguishable, and the browser history read as the same entry
 * repeated. `PageHeader` calls this, so any page with a header is covered
 * without remembering to.
 */
export function usePageTitle(title?: string | null): void {
  useEffect(() => {
    const previous = document.title;
    const trimmed = title?.trim();
    document.title = trimmed ? `${trimmed} · ${env.appName}` : env.appName;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
