import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { clearStored, readStored, writeStored } from '@/lib/storage';

const VERSION = 1;
const SAVE_DEBOUNCE_MS = 120;

let manualRestorationSet = false;

/** Where this exact URL was scrolled to, so a refresh or Back returns to it instead of snapping to the top. */
function keyFor(pathname: string, search: string): string {
  return `scroll:${pathname}${search}`;
}

/**
 * Restores window scroll position per route (pathname + query), and saves it
 * as the user scrolls. Session-scoped on purpose — scroll position is a
 * property of this tab's history, not something that should follow the user
 * to another tab or another day.
 *
 * Mount once, near the root of the authenticated shell (it reads the router's
 * current location itself, so it does not need to be repeated per page).
 */
export function useScrollRestoration(): void {
  const location = useLocation();

  useEffect(() => {
    // The browser's own scroll restoration fights ours on refresh/Back — we
    // own it instead. Best-effort: unsupported in some environments (jsdom).
    if (!manualRestorationSet) {
      try {
        if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
        manualRestorationSet = true;
      } catch {
        /* not supported here — window scroll still restores via our own effect */
      }
    }
  }, []);

  useEffect(() => {
    const key = keyFor(location.pathname, location.search);
    const stored = readStored<number>('session', key, VERSION);
    const y = stored && Number.isFinite(stored.data) ? stored.data : 0;
    // Wait a frame: the page below has just (re)mounted and may still be
    // laying out its content, so scrolling immediately can land short.
    const id = window.requestAnimationFrame(() => window.scrollTo(0, y));
    return () => window.cancelAnimationFrame(id);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const key = keyFor(location.pathname, location.search);
    let timer: number | undefined;

    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (window.scrollY > 0) {
          writeStored('session', key, VERSION, window.scrollY);
        } else {
          // Top of page is the default restore position anyway — don't keep
          // an ever-growing set of "0" entries around for every route visited.
          clearStored('session', key);
        }
      }, SAVE_DEBOUNCE_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [location.pathname, location.search]);
}
