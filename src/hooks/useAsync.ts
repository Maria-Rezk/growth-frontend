import { useCallback, useRef } from 'react';
import { keepPreviousData, useMutation as useReactQueryMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/http';
import type { ApiErrorShape } from '@/types/domain';

type AsyncResult<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** HTTP status of the failure, when the API sent one. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
  setData: (value: T | ((current: T | null) => T | null)) => void;
};

type AsyncOptions = {
  /**
   * Required: a semantic key from `queryKeys` in queryClient.ts, e.g.
   * `queryKeys.posts(companyId, filters)`. It names the cache entry and is how
   * mutations reach it — a key under ['companies', id, …] is refreshed by every
   * prefix invalidation for that client.
   *
   * There used to be a fallback built from `factory.toString()`: two hooks
   * whose code read the same shared one cache entry, minification changed the
   * keys, and no invalidation could ever name them.
   */
  queryKey: readonly unknown[];
  enabled?: boolean;
  /**
   * Poll every N ms. React Query pauses the interval while the window is not
   * focused (`refetchIntervalInBackground` stays false), which is exactly the
   * "refresh every 60 s while the tab is visible" the admin dashboard wants —
   * a background tab must not keep hammering twelve endpoints.
   */
  refetchInterval?: number;
  /** Keep showing the previous key's data while a new key loads (paging, "show more"). */
  keepPreviousData?: boolean;
};

/**
 * `_dependencies` is no longer read: the query key carries the inputs (a new
 * key is a new query). It stays in the signature so the ~90 call sites keep
 * their shape; callers should still list what the factory closes over.
 */
export function useAsync<T>(
  factory: () => Promise<T>,
  _dependencies: unknown[],
  options: AsyncOptions,
): AsyncResult<T> {
  const queryClient = useQueryClient();
  const { queryKey } = options;

  const query = useQuery({
    queryKey,
    queryFn: factory,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
  });

  /*
    Both callbacks keep one identity for the life of the component. They used
    to depend on `query` (a new result object every render) and on `queryKey`
    (a new array every render, since callers build it inline), so they changed
    on every render: any effect, memo or context value listing them re-ran
    each time — CompanyContext's value was rebuilt on every render through
    refreshMemberships. React Query's own `refetch` is already stable, and the
    latest key is read through a ref when setData runs.
  */
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  const latestKey = useRef(queryKey);
  latestKey.current = queryKey;
  const setData = useCallback(
    (value: T | ((current: T | null) => T | null)) => {
      queryClient.setQueryData<T | null>(latestKey.current, (current) => {
        if (typeof value === 'function') return (value as (current: T | null) => T | null)(current ?? null);
        return value;
      });
    },
    [queryClient],
  );

  return {
    data: (query.data ?? null) as T | null,
    // First load only — background refetches keep showing data instead of blanking.
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error ? errorMessage(query.error) : null,
    errorStatus: (query.error as ApiErrorShape | null)?.statusCode ?? null,
    refetch,
    setData,
  };
}

type MutationOptions<Args extends unknown[], Result> = {
  /** Query keys to invalidate on success. Partial keys match all sub-keys (prefix match). */
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
  onSuccess?: (result: Result, args: Args) => void;
  /**
   * Receives the *raw* rejection, not the flattened message — use it with
   * `applyServerFieldErrors` to map an API 400 onto the right form fields.
   * `mutate()` swallows the throw, and the `error` string below has already
   * lost `fieldErrors`, so this is the only place they're reachable.
   */
  onError?: (error: unknown, args: Args) => void;
};

function isPlain(value: unknown): value is Record<string, unknown> | unknown[] {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}

/** Same primitive or instance — or two plain objects with the same content (a payload rebuilt per click). Files compare by identity. */
function sameArgument(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!isPlain(left) || !isPlain(right)) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function useMutation<Args extends unknown[], Result>(
  mutationFn: (...args: Args) => Promise<Result>,
  options?: MutationOptions<Args, Result>,
) {
  const queryClient = useQueryClient();

  const mutation = useReactQueryMutation<Result, unknown, Args>({
    mutationFn: (args: Args) => mutationFn(...args),
    onSuccess: (result, args) => {
      options?.invalidateKeys?.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key });
      });
      options?.onSuccess?.(result, args);
    },
    onError: (error, args) => {
      options?.onError?.(error, args);
    },
  });

  /*
    An exact repeat of a call that is still in flight is dropped. `loading`
    only flips on the next render, so a double-click lands inside it and used
    to send the comment, note or verdict twice. Compared argument by argument
    (Object.is): two different files, or the same action on two different
    records, still both go through.
  */
  const inFlight = useRef<Args[]>([]);

  const mutate = useCallback(
    async (...args: Args): Promise<Result | null> => {
      const duplicate = inFlight.current.some(
        (pending) => pending.length === args.length && pending.every((value, index) => sameArgument(value, args[index])),
      );
      if (duplicate) return null;
      inFlight.current.push(args);
      try {
        return await mutation.mutateAsync(args);
      } catch {
        return null;
      } finally {
        inFlight.current = inFlight.current.filter((pending) => pending !== args);
      }
    },
    [mutation],
  );

  return {
    mutate,
    loading: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error) : null,
    data: mutation.data ?? null,
    reset: mutation.reset,
  };
}