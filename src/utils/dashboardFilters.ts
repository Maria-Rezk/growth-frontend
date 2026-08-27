import type { DashboardFilters } from '@/types/domain';

/** Today as `YYYY-MM-DD` in the viewer's timezone — the API's default range. */
export function today(): string {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const offsetMinutes = now.getTimezoneOffset();
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * One serializer for every widget.
 *
 * Empty values are omitted entirely rather than sent blank: the API validates
 * with `whitelist` + `forbidNonWhitelisted`, so `?clientId=` is a 400 on an
 * unparseable UUID, not an ignored filter.
 */
export function serializeFilters(filters: DashboardFilters): string {
  return new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
}

/** `path?from=…&to=…`, or `path` when nothing survives serialization. */
export function withFilters(path: string, filters: DashboardFilters): string {
  const query = serializeFilters(filters);
  return query ? `${path}?${query}` : path;
}
