// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queryClient';
import { useAsync, useMutation } from './useAsync';

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
}

describe('useAsync — semantic keys and invalidation', () => {
  /*
    Each case: a detail sub-resource, and the prefix a mutation elsewhere
    invalidates (e.g. approving a post from the queue). The sub-resource must
    refetch — fresh data, not the cached copy for the rest of staleTime.
  */
  it.each([
    ['post comments', queryKeys.postComments('c1', 'p1'), ['companies', 'c1', 'posts']],
    ['post approval logs', queryKeys.postLogs('c1', 'p1'), ['companies', 'c1', 'posts']],
    ['task comments', queryKeys.taskComments('c1', 't1'), ['companies', 'c1', 'tasks']],
    ['task activity logs', queryKeys.taskLogs('c1', 't1'), ['companies', 'c1', 'tasks']],
    ['lead notes', queryKeys.leadNotes('c1', 'l1'), ['companies', 'c1', 'leads']],
    ['lead status history', queryKeys.leadHistory('c1', 'l1'), ['companies', 'c1', 'leads']],
    ['report detail', queryKeys.report('c1', 'r1'), ['companies', 'c1', 'reports']],
  ] as const)('%s refetch when a mutation invalidates their prefix', async (_name, key, prefix) => {
    const client = newClient();
    let version = 0;
    const fetcher = vi.fn(async () => `v${++version}`);
    const { result } = renderHook(
      () => ({
        read: useAsync(fetcher, [], { queryKey: key }),
        write: useMutation(async () => 'ok', { invalidateKeys: [prefix] }),
      }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.read.data).toBe('v1'));
    await act(async () => { await result.current.write.mutate(); });
    await waitFor(() => expect(result.current.read.data).toBe('v2'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not refetch a sub-resource for a mutation on another client', async () => {
    const client = newClient();
    const fetcher = vi.fn(async () => 'data');
    const { result } = renderHook(
      () => ({
        read: useAsync(fetcher, [], { queryKey: queryKeys.taskLogs('c1', 't1') }),
        write: useMutation(async () => 'ok', { invalidateKeys: [['companies', 'c2', 'tasks']] }),
      }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.read.data).toBe('data'));
    await act(async () => { await result.current.write.mutate(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps two records apart even when their fetch code is identical', async () => {
    // The old fallback keyed on factory.toString(): identical code, one entry.
    const client = newClient();
    const read = (id: string) => () => Promise.resolve(`comments of ${id}`);
    const { result } = renderHook(
      () => ({
        first: useAsync(read('p1'), [], { queryKey: queryKeys.postComments('c1', 'p1') }),
        second: useAsync(read('p2'), [], { queryKey: queryKeys.postComments('c1', 'p2') }),
      }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.second.data).toBe('comments of p2'));
    expect(result.current.first.data).toBe('comments of p1');
  });

  it('keeps loading, data and error behaving as before', async () => {
    const client = newClient();
    const { result } = renderHook(
      () => useAsync(() => Promise.reject(Object.assign(new Error('Nope.'), { statusCode: 404 })), [], { queryKey: ['test', 'error'] }),
      { wrapper: wrapperFor(client) },
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.error).toBe('Nope.'));
    expect(result.current.errorStatus).toBe(404);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});
