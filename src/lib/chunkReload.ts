/**
 * Recovers from a stale-deploy chunk failure without asking the user to
 * refresh manually.
 *
 * Route-level code splitting (see `App.tsx`) means each page is its own JS
 * file, named with a content hash. After a new deploy, the *app shell*
 * (already open in someone's tab) still references the old hashes — clicking
 * into a page that changed since they loaded the app 404s the dynamic
 * `import()`. That failure was previously indistinguishable from a real bug:
 * it hit the generic error boundary with a "Try again" button that could
 * never work, because retrying re-requests the same missing file.
 *
 * The fix is the same one browsers already expect a person to do by hand:
 * reload the page, which fetches the current `index.html` and current chunk
 * hashes. A one-shot cooldown (sessionStorage, not a counter) stops a
 * genuinely broken deploy from reload-looping the tab.
 */

const RELOAD_FLAG_KEY = 'growth.chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CHUNK_ERROR_PATTERN.test(message);
}

/**
 * Reloads the page once for a stale-chunk failure. Returns true if it did
 * (the caller should stop rendering — a reload is already in flight), false
 * if this was not that kind of error, or it already tried too recently.
 *
 * `reload` is injectable (defaults to the real `window.location.reload`) so
 * tests can observe it without fighting jsdom's non-configurable `location`.
 */
export function recoverFromChunkLoadError(error: unknown, reload: () => void = () => window.location.reload()): boolean {
  if (!isChunkLoadError(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // If we can't remember having tried, still attempt the reload once —
    // worst case is one extra reload, not a loop, since the flag write is
    // the only thing that failed here.
  }

  reload();
  return true;
}
