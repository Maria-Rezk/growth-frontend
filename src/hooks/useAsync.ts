import { useCallback, useMemo } from 'react';
import { useMutation as useReactQueryMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/http';

type AsyncResult<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setData: (value: T | ((current: T | null) => T | null)) => void;
};

type AsyncOptions = {
  /** Prefer a stable semantic key from queryClient.ts (e.g. queryKeys.posts(companyId, filters)). */
  queryKey?: readonly unknown[];
  enabled?: boolean;
  /**
   * Poll every N ms. React Query pauses the interval while the window is not
   * focused (`refetchIntervalInBackground` stays false), which is exactly the
   * "refresh every 60 s while the tab is visible" the admin dashboard wants —
   * a background tab must not keep hammering twelve endpoints.
   */
  refetchInterval?: number;
};

function stableDependencyKey(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function useAsync<T>(
  factory: () => Promise<T>,
  dependencies: unknown[] = [],
  options?: AsyncOptions,
): AsyncResult<T> {
  const queryClient = useQueryClient();

  const fallbackKey = useMemo(
    () => ['legacy-async', factory.toString(), ...dependencies.map(stableDependencyKey)] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies,
  );
  const queryKey = options?.queryKey ?? fallbackKey;

  const query = useQuery({
    queryKey,
    queryFn: factory,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const setData = useCallback(
    (value: T | ((current: T | null) => T | null)) => {
      queryClient.setQueryData<T | null>(queryKey, (current) => {
        if (typeof value === 'function') return (value as (current: T | null) => T | null)(current ?? null);
        return value;
      });
    },
    [queryClient, queryKey],
  );

  return {
    data: (query.data ?? null) as T | null,
    // First load only — background refetches keep showing data instead of blanking.
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error ? errorMessage(query.error) : null,
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

  const mutate = useCallback(
    async (...args: Args): Promise<Result | null> => {
      try {
        return await mutation.mutateAsync(args);
      } catch {
        return null;
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