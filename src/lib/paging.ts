import { http, unwrapList } from '@/lib/http';

/** The API's page size ceiling. Asking for more is clamped, not an error. */
export const PAGE_MAX = 100;
/**
 * The most rows `getAllItems` will gather. Past this the list is cut off rather
 * than the browser being asked to hold an unbounded amount: a screen that can
 * legitimately reach this many rows needs real server paging instead.
 */
export const MAX_ROWS = 5000;
/** Pages in flight at once once the total is known. */
const CONCURRENCY = 5;

type Page<T> = { items: T[]; total: number | undefined };

async function fetchPage<T>(url: string, params: Record<string, unknown> | undefined, offset: number): Promise<Page<T>> {
  const response = await http.get(url, { params: { ...params, limit: PAGE_MAX, offset } });
  const body = response.data as unknown;
  const items = unwrapList<T>(body);
  if (Array.isArray(body)) return { items, total: undefined };
  const envelope = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nested = (envelope.data && typeof envelope.data === 'object' ? envelope.data : {}) as Record<string, unknown>;
  const total = [envelope.total, nested.total].find((value): value is number => typeof value === 'number');
  return { items, total };
}

/**
 * Every row of a paged list.
 *
 * The API answers `{ items, total, limit, offset }` with a default page of 25,
 * so a bare `GET` silently drops everything past the 25th row — the 26th
 * client, the 26th task. This asks for the maximum page, and once the first
 * answer has said how many rows exist it fetches the rest a few pages at a
 * time. Endpoints that still answer a bare array (posts, content plans,
 * comments, notes) come back whole in the first response and are returned as
 * they are.
 *
 * Meant for reference data and for lists the screen groups or sorts itself
 * (a board, a picker). It is not a substitute for server paging on a list that
 * can grow without bound; see `MAX_ROWS`.
 */
export async function getAllItems<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  const first = await fetchPage<T>(url, params, 0);
  const total = first.total === undefined ? first.items.length : Math.min(first.total, MAX_ROWS);
  const step = first.items.length;
  // Bare array, a complete first page, or a server that sent nothing to step by.
  if (first.total === undefined || step === 0 || step >= total) return first.items;

  const offsets: number[] = [];
  for (let offset = step; offset < total; offset += step) offsets.push(offset);

  const rows = [...first.items];
  for (let start = 0; start < offsets.length; start += CONCURRENCY) {
    const pages = await Promise.all(offsets.slice(start, start + CONCURRENCY).map((offset) => fetchPage<T>(url, params, offset)));
    for (const page of pages) rows.push(...page.items);
    if (pages.some((page) => page.items.length === 0)) break;
  }

  // A server that ignores `offset` answers the first page every time; never list a row twice.
  const seen = new Set<unknown>();
  return rows.filter((row) => {
    const id = (row as { id?: unknown } | null)?.id;
    if (id === undefined) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_ROWS);
}
