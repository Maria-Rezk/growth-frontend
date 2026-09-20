import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { today } from '@/utils/dashboardFilters';
import type { DashboardFilters } from '@/types/domain';

/** Filters the user can change from the bar. Paging is per-widget, not shared. */
export type SharedFilters = Pick<DashboardFilters, 'from' | 'to' | 'clientId' | 'employeeId'>;

const KEYS = ['from', 'to', 'clientId', 'employeeId'] as const;

/**
 * Dashboard filter state, owned by the URL.
 *
 * Keeping it in the query string is the product requirement, not a nicety: a
 * filtered dashboard has to be a shareable link, and reloading must restore
 * the same view rather than snapping back to today. `replace: true` keeps the
 * back button meaning "leave the dashboard" instead of stepping backwards
 * through every filter tweak.
 */
export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<SharedFilters>(() => {
    const defaultDay = today();
    return {
      from: searchParams.get('from') || defaultDay,
      to: searchParams.get('to') || defaultDay,
      clientId: searchParams.get('clientId') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<SharedFilters>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(patch).forEach(([key, value]) => {
            if (value) next.set(key, String(value));
            else next.delete(key);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        KEYS.forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { filters, setFilters, resetFilters };
}

/**
 * A single filter value held in the URL query string.
 *
 * The audit view needs two parameters the shared bar does not carry (`userId`
 * and `entityType`). Rather than widen `SharedFilters` — which every widget
 * would then include in its query key, refetching twelve endpoints when a
 * filter only one screen uses changes — those live here.
 */
export function useUrlParam(name: string): [string | undefined, (value: string | undefined) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const set = useCallback(
    (value: string | undefined) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(name, value);
          else next.delete(name);
          return next;
        },
        { replace: true },
      );
    },
    [name, setSearchParams],
  );

  return [searchParams.get(name) || undefined, set];
}

/**
 * A page's filter set, held in the URL.
 *
 * `defaults` names every key and its empty value. A value equal to its
 * default is dropped from the query string, so a clean page has a clean
 * URL, and `Back` still means "leave the page". Used by the Tasks, Posts
 * and Leads screens so a filtered list is a link that can be shared, and a
 * reload does not snap back to "all".
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const next = { ...defaults };
    (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
      const raw = searchParams.get(String(key));
      if (raw !== null) next[key] = raw as T[keyof T];
    });
    return next;
  }, [defaults, searchParams]);

  const set = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === defaults[key]) next.delete(key);
            else next.set(key, String(value));
          });
          return next;
        },
        { replace: true },
      );
    },
    [defaults, setSearchParams],
  );

  const reset = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.keys(defaults).forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  }, [defaults, setSearchParams]);

  return [values, set, reset];
}
