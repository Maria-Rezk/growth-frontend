import { describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';

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
