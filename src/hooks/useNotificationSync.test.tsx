// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NOTIFICATION_MIN_GAP_MS, NOTIFICATION_POLL_MS, useNotificationSync } from './useNotificationSync';

let visibility: DocumentVisibilityState = 'visible';
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  online = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => act(async () => { await Promise.resolve(); });

function setup(enabled = true, refresh = vi.fn(async () => {})) {
  const hook = renderHook(({ on }) => useNotificationSync(on, refresh), { initialProps: { on: enabled } });
  return { refresh, ...hook };
}

describe('useNotificationSync', () => {
  it('refreshes every 30 seconds while the tab is visible', async () => {
    const { refresh } = setup();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('makes no request while the tab is hidden or the machine is offline', async () => {
    const { refresh } = setup();
    visibility = 'hidden';
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 3); });
    visibility = 'visible';
    online = false;
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 3); });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes at once on returning to the tab, and on reconnecting', async () => {
    const { refresh } = setup();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).not.toHaveBeenCalled();
    visibility = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await flush();

    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_MIN_GAP_MS); });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('treats triggers close together as one refresh, and shares one in flight', async () => {
    let finish: () => void = () => {};
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = setup(true, refresh);

    // Two explicit refreshes while the first is still running: one request.
    const first = result.current();
    const second = result.current();
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await first; await second; });

    // Return-to-tab and reconnect a moment later: still within the gap, nothing new.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when signed out, and stops when the user signs out', async () => {
    const { refresh, rerender, result } = setup(false);
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 2); });
    await act(async () => { await result.current(); });
    expect(refresh).not.toHaveBeenCalled();

    rerender({ on: true });
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender({ on: false });
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 3); });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh is quiet, and the next tick tries again', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    setup(true, refresh);
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
