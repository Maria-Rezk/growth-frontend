import { describe, expect, it } from 'vitest';
import { queryClient, queryKeys } from './queryClient';

/*
  Pins the defaults that make data update without a manual refresh: a stale
  query used to stay on screen until something happened to remount it, since
  neither refocusing the tab nor the network coming back triggered a
  re-fetch. Both are on now — see queryClient.ts for why that is safe (React
  Query only re-fetches queries currently in use, not a polling loop).
*/
describe('queryClient defaults', () => {
  it('refetches stale queries on window focus and on reconnect', () => {
    const { queries } = queryClient.getDefaultOptions();
    expect(queries?.refetchOnWindowFocus).toBe(true);
    expect(queries?.refetchOnReconnect).toBe(true);
  });

  it('does not automatically retry a failed mutation', () => {
    const { mutations } = queryClient.getDefaultOptions();
    expect(mutations?.retry).toBe(false);
  });
});

/*
  Detail sub-resources sit under the key their mutations already invalidate.
  A key outside the tree (the old factory.toString() fallback) was never
  refreshed by an approval or status change made on another screen.
*/
describe('queryKeys nesting', () => {
  const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) =>
    prefix.every((part, index) => key[index] === part);

  it.each([
    ['postComments', queryKeys.postComments('c1', 'p1'), queryKeys.post('c1', 'p1')],
    ['postLogs', queryKeys.postLogs('c1', 'p1'), queryKeys.post('c1', 'p1')],
    ['taskComments', queryKeys.taskComments('c1', 't1'), queryKeys.task('c1', 't1')],
    ['taskLogs', queryKeys.taskLogs('c1', 't1'), queryKeys.task('c1', 't1')],
    ['leadNotes', queryKeys.leadNotes('c1', 'l1'), queryKeys.lead('c1', 'l1')],
    ['leadHistory', queryKeys.leadHistory('c1', 'l1'), queryKeys.lead('c1', 'l1')],
    ['report', queryKeys.report('c1', 'r1'), queryKeys.reports('c1')],
  ])('%s sits under its parent key', (_name, key, parent) => {
    expect(startsWith(key, parent)).toBe(true);
    expect(key.length).toBeGreaterThan(parent.length);
  });

  it('keeps one record apart from another', () => {
    expect(queryKeys.postComments('c1', 'p1')).not.toEqual(queryKeys.postComments('c1', 'p2'));
    expect(queryKeys.taskLogs('c1', 't1')).not.toEqual(queryKeys.taskLogs('c2', 't1'));
  });
});
