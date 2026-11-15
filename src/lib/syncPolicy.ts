import type { Query } from '@tanstack/react-query';
import type { ApiErrorShape } from '@/types/domain';

/*
  Automatic data synchronisation, phase 1.

  Which cached queries re-fetch on their own while the page is in front, and
  how often. Everything is decided here, from the query key alone, so a page
  does not opt in by passing an interval: the shapes below are the whole list,
  and a key that matches none of them never polls (`syncTierFor` returns null
  and the interval is `false`). The unit tests pin both sides — the keys that
  must poll, and a catalogue of keys that must not.

  React Query does the rest, with its defaults kept on purpose:
  - foreground only: an interval tick is skipped while the tab is hidden
    (`refetchIntervalInBackground` stays false), and nothing runs offline;
  - one request per query: a tick joins a fetch already in flight, and any
    fetch (focus, reconnect, a mutation's invalidation) restarts the timer, so
    a focus refetch is not followed by a poll a moment later;
  - only queries a mounted screen is using have a timer at all.

  Notifications are not here: they keep their own sync (useNotificationSync).
  The admin dashboard widgets pass their own interval and are not here either.

  Backend budget (see the phase-1 report): the API rate-limits every endpoint
  at 100 requests a minute per client address, and behind nginx that address
  may be the proxy's — one budget for every user. The intervals below keep each
  open screen at or under two requests a minute per endpoint, and a 429 backs
  everything off for a full window.
*/

export type SyncTier = 'tasks-list' | 'task-detail' | 'approval-queue' | 'leads' | 'lead-counts' | 'my-work';

export const SYNC_INTERVAL_MS: Record<Exclude<SyncTier, 'my-work'>, number> = {
  'tasks-list': 60_000,
  'task-detail': 30_000,
  'approval-queue': 30_000,
  leads: 60_000,
  /*
    The pipeline tiles are one `limit=1` request per stage (seven today), all
    to the leads list endpoint (`leadsService.statusCounts`). At the list's
    60 s that is seven of every nine Leads requests. A lead change made in the
    app still refreshes them at once (its mutation invalidates the prefix);
    this only paces changes made by somebody else.
  */
  'lead-counts': 5 * 60_000,
};

/**
 * My work sends one request per client each time it refreshes
 * (`myWorkService.listAcrossClients`), all to the same endpoint
 * (`GET /companies/:id/tasks/my`). Thirty seconds per client keeps one open
 * My work page at two requests a minute on that endpoint, like every other
 * synced screen; never faster than a minute, never slower than five.
 */
export const MY_WORK_MS_PER_CLIENT = 30_000;
export const MY_WORK_MIN_MS = 60_000;
export const MY_WORK_MAX_MS = 5 * 60_000;

export function myWorkIntervalMs(clientCount: number): number {
  const count = Math.max(1, Math.floor(clientCount));
  return Math.min(MY_WORK_MAX_MS, Math.max(MY_WORK_MIN_MS, count * MY_WORK_MS_PER_CLIENT));
}

/** After a failed refresh: try again less often. After a 429: wait out the server's whole window and more. */
export const ERROR_BACKOFF_FACTOR = 4;
export const RATE_LIMITED_MS = 5 * 60_000;
/** Every synced query holds off this long after any 429, whichever endpoint answered it. */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Segments under a task list that are other lists, not a task id. */
const TASK_SUB_LISTS = new Set(['approval-queue', 'drafts']);

/**
 * The tier a query key belongs to, or null for everything else. Explicit
 * shapes only — see queryKeys in queryClient.ts for where each comes from.
 */
export function syncTierFor(key: readonly unknown[]): SyncTier | null {
  const [root, second, third, fourth, fifth, sixth] = key;

  if (root === 'my-work') {
    // ['my-work', 'approval-queue', params]: the cross-client approval queue page.
    if (second === 'approval-queue') return key.length === 3 && isPlainObject(third) ? 'approval-queue' : null;
    // ['my-work', 'id|id|…', filters]: My work.
    return typeof second === 'string' && isPlainObject(third) && key.length === 3 ? 'my-work' : null;
  }

  if (root !== 'companies' || !isId(second)) return null;

  if (third === 'tasks') {
    // ['companies', id, 'tasks', filters, scope?, 'alerts'?]: the board, the table and the alert tiles.
    if (isPlainObject(fourth)) {
      if (key.length === 4) return 'tasks-list';
      if (key.length === 5 && isId(fifth)) return 'tasks-list';
      if (key.length === 6 && isId(fifth) && sixth === 'alerts') return 'tasks-list';
      return null;
    }
    // ['companies', id, 'tasks', 'approval-queue', params]: the per-client queue (Tasks › Awaiting my approval).
    if (fourth === 'approval-queue') return key.length === 5 && isPlainObject(fifth) ? 'approval-queue' : null;
    if (!isId(fourth) || TASK_SUB_LISTS.has(fourth)) return null;
    // ['companies', id, 'tasks', taskId] and its comments and activity history.
    if (key.length === 4) return 'task-detail';
    if (key.length === 5 && (fifth === 'comments' || fifth === 'activity-logs')) return 'task-detail';
    return null;
  }

  // ['companies', id, 'attachments', 'TASK', taskId]: the task page's files, which its activity rows name.
  if (third === 'attachments') {
    return key.length === 5 && fourth === 'TASK' && isId(fifth) ? 'task-detail' : null;
  }

  if (third === 'leads') {
    // ['companies', id, 'leads', filters] and the follow-up list [..., 'follow-up'].
    if (isPlainObject(fourth)) {
      if (key.length === 4) return 'leads';
      if (key.length === 5 && fifth === 'follow-up') return 'leads';
      return null;
    }
    // ['companies', id, 'leads', 'counts', filters]: the pipeline counts above the list.
    if (fourth === 'counts') return key.length === 5 && isPlainObject(fifth) ? 'lead-counts' : null;
    return null;
  }

  return null;
}

/** Base interval for a key: its tier's, or false for a key that does not sync. */
export function baseIntervalFor(key: readonly unknown[]): number | false {
  const tier = syncTierFor(key);
  if (tier === null) return false;
  if (tier === 'my-work') {
    const ids = typeof key[1] === 'string' ? key[1].split('|').filter(Boolean) : [];
    return myWorkIntervalMs(ids.length);
  }
  return SYNC_INTERVAL_MS[tier];
}

let rateLimitedUntil = 0;

function statusOf(error: unknown): number | undefined {
  return (error as ApiErrorShape | null | undefined)?.statusCode;
}

/** Called for every failed query (QueryCache onError): a 429 anywhere backs every synced query off. */
export function noteQueryError(error: unknown, now: number = Date.now()): void {
  if (statusOf(error) === 429) rateLimitedUntil = Math.max(rateLimitedUntil, now + RATE_LIMIT_COOLDOWN_MS);
}

/** Test seam. */
export function resetSyncState(): void {
  rateLimitedUntil = 0;
}

/**
 * The `refetchInterval` every query gets by default (queryClient.ts). A hook
 * that passes its own interval (the admin widgets) is not affected.
 *
 * React Query re-reads this whenever the query changes state, so a failure
 * stretches the next wait and the next success brings it back.
 */
export function syncRefetchInterval(query: Pick<Query, 'queryKey' | 'state'>, now: number = Date.now()): number | false {
  const base = baseIntervalFor(query.queryKey);
  if (base === false) return false;

  let interval = base;
  if (query.state.status === 'error') {
    interval = statusOf(query.state.error) === 429 ? RATE_LIMITED_MS : Math.min(RATE_LIMITED_MS, base * ERROR_BACKOFF_FACTOR);
  }
  if (rateLimitedUntil > now) interval = Math.max(interval, rateLimitedUntil - now);
  return interval;
}
