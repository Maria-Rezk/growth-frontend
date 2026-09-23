// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStorageSync } from './useStorageSync';

function dispatchStorage(key: string | null, newValue: string | null, area: Storage = window.localStorage) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: area }));
}

describe('useStorageSync', () => {
  it('calls back when the watched key changes in another tab', () => {
    const onChange = vi.fn();
    renderHook(() => useStorageSync('growth.accessToken', onChange));

    dispatchStorage('growth.accessToken', 'new-token');
    expect(onChange).toHaveBeenCalledWith('new-token');
  });

  it('ignores a change to an unrelated key', () => {
    const onChange = vi.fn();
    renderHook(() => useStorageSync('growth.accessToken', onChange));

    dispatchStorage('some.other.key', 'value');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores events from a different storage area', () => {
    const onChange = vi.fn();
    renderHook(() => useStorageSync('k', onChange));

    dispatchStorage('k', 'value', window.sessionStorage);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('always calls the latest callback without resubscribing the listener on every render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useStorageSync('k', cb), { initialProps: { cb: first } });
    rerender({ cb: second });

    dispatchStorage('k', 'value');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('value');
  });
});
