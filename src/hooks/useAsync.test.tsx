// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
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

describe('useAsync — stable callbacks', () => {
  it('keeps refetch and setData the same across re-renders and data changes', async () => {
    const client = newClient();
    let version = 0;
    const { result, rerender } = renderHook(
      // A fresh key array on every render, as every caller builds it inline.
      () => useAsync(async () => `v${++version}`, [], { queryKey: ['companies', 'c1', 'tasks', 't1'] }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.data).toBe('v1'));
    const { refetch, setData } = result.current;

    rerender();
    await act(async () => { await result.current.refetch(); });
    // React Query notifies on its own scheduler, after act() returns.
    await waitFor(() => expect(result.current.data).toBe('v2'));
    rerender();

    expect(result.current.refetch).toBe(refetch);
    expect(result.current.setData).toBe(setData);
  });

  it('does not re-run an effect that depends on refetch', async () => {
    const client = newClient();
    const effectRuns = vi.fn();
    const { result, rerender } = renderHook(
      () => {
        const query = useAsync(async () => 'data', [], { queryKey: ['test', 'effect'] });
        useEffect(() => { effectRuns(); }, [query.refetch]);
        return query;
      },
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.data).toBe('data'));
    rerender();
    rerender();
    expect(effectRuns).toHaveBeenCalledTimes(1);
  });

  it('still refetches, and setData writes to the current key after the key changes', async () => {
    const client = newClient();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useAsync(async () => `server ${id}`, [id], { queryKey: ['test', 'record', id] }),
      { wrapper: wrapperFor(client), initialProps: { id: 'a' } },
    );
    await waitFor(() => expect(result.current.data).toBe('server a'));
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.data).toBe('server b'));

    act(() => result.current.setData('edited b'));
    expect(client.getQueryData(['test', 'record', 'b'])).toBe('edited b');
    expect(client.getQueryData(['test', 'record', 'a'])).toBe('server a');
    await waitFor(() => expect(result.current.data).toBe('edited b'));
  });
});

/** A promise the test resolves or rejects when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useAsync — automatic sync stays out of the way', () => {
  it('a background refresh is not "refreshing"; a refetch the screen asked for is', async () => {
    const client = newClient();
    let next = deferred<string>();
    let calls = 0;
    const fetcher = vi.fn(() => { calls += 1; return calls === 1 ? Promise.resolve('v1') : next.promise; });
    const key = queryKeys.task('c1', 't1');
    const { result } = renderHook(() => useAsync(fetcher, [], { queryKey: key }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBe('v1'));

    // What a poll, focus or reconnect does: a refetch nobody on this screen started.
    act(() => { void client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(client.isFetching({ queryKey: key })).toBe(1));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.data).toBe('v1');
    await act(async () => { next.resolve('v2'); await next.promise; });
    await waitFor(() => expect(result.current.data).toBe('v2'));

    next = deferred<string>();
    let manual!: Promise<void>;
    act(() => { manual = result.current.refetch(); });
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    await act(async () => { next.resolve('v3'); await manual; });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.data).toBe('v3');
  });

  it('keeps the loaded data, not an error screen, when a background refresh fails', async () => {
    const client = newClient();
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw Object.assign(new Error('Network down'), { statusCode: 503 });
      return 'v1';
    });
    const key = queryKeys.tasks('c1', {});
    const { result } = renderHook(() => useAsync(fetcher, [], { queryKey: key }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBe('v1'));

    fail = true;
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(result.current.staleError).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(result.current.errorStatus).toBeNull();
    expect(result.current.data).toBe('v1');

    fail = false;
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(result.current.staleError).toBeNull());
  });

  it('still reports a record that is gone (404) even with older data on screen', async () => {
    const client = newClient();
    let gone = false;
    const fetcher = vi.fn(async () => {
      if (gone) throw Object.assign(new Error('Not found'), { statusCode: 404 });
      return 'task';
    });
    const key = queryKeys.task('c1', 't1');
    const { result } = renderHook(() => useAsync(fetcher, [], { queryKey: key }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBe('task'));
    gone = true;
    await act(async () => { await client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(result.current.errorStatus).toBe(404));
    expect(result.current.error).not.toBeNull();
  });

  it('a first-load failure is still an error', async () => {
    const client = newClient();
    const fetcher = vi.fn(async () => { throw Object.assign(new Error('Down'), { statusCode: 503 }); });
    const { result } = renderHook(() => useAsync(fetcher, [], { queryKey: queryKeys.tasks('c1', {}) }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.error).toBe('Down'));
    expect(result.current.staleError).toBeNull();
  });

  it('a read sent before a mutation cannot put the old record back after setData', async () => {
    const client = newClient();
    const stale = deferred<string>();
    let calls = 0;
    const fetcher = vi.fn(() => { calls += 1; return calls === 1 ? Promise.resolve('before') : stale.promise; });
    const key = queryKeys.task('c1', 't1');
    const { result } = renderHook(() => useAsync(fetcher, [], { queryKey: key }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBe('before'));

    act(() => { void client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(client.isFetching({ queryKey: key })).toBe(1));
    act(() => { result.current.setData('after-mutation'); });
    await act(async () => { stale.resolve('before'); await stale.promise.catch(() => undefined); });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.data).toBe('after-mutation');
  });

  it('a mutation drops reads of its keys already in flight, then re-reads once it succeeds', async () => {
    const client = newClient();
    const stale = deferred<string>();
    let calls = 0;
    const fetcher = vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve('v1');
      if (calls === 2) return stale.promise; // the poll sent before the change
      return Promise.resolve('after-change');
    });
    const key = queryKeys.task('c1', 't1');
    const { result } = renderHook(
      () => ({
        read: useAsync(fetcher, [], { queryKey: key }),
        write: useMutation(async () => 'ok', { invalidateKeys: [['companies', 'c1', 'tasks']] }),
      }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.read.data).toBe('v1'));
    act(() => { void client.refetchQueries({ queryKey: key }); });
    await waitFor(() => expect(client.isFetching({ queryKey: key })).toBe(1));

    await act(async () => { await result.current.write.mutate(); });
    await waitFor(() => expect(result.current.read.data).toBe('after-change'));
    // The poll answers late with the old record; it was dropped, so nothing changes.
    await act(async () => { stale.resolve('v1-late'); await stale.promise; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.read.data).toBe('after-change');
  });

  it('passes no interval of its own unless asked, so the shared policy applies', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: () => 12_345 } } });
    const { result } = renderHook(() => useAsync(async () => 'x', [], { queryKey: queryKeys.task('c1', 't1') }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBe('x'));
    const observerOptions = client.getQueryCache().find({ queryKey: queryKeys.task('c1', 't1') })!.observers[0].options;
    expect(typeof observerOptions.refetchInterval).toBe('function');
  });
});
