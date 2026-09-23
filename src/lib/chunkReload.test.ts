// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, recoverFromChunkLoadError } from './chunkReload';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isChunkLoadError', () => {
  it('recognizes a stale dynamic import failure', () => {
    const error = new Error('Failed to fetch dynamically imported module: https://app/assets/TasksPage-abc123.js');
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('does not flag an unrelated error', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false);
  });

  it('does not flag a non-Error value', () => {
    expect(isChunkLoadError({ some: 'object' })).toBe(false);
  });
});

describe('recoverFromChunkLoadError', () => {
  it('reloads once for a chunk load error', () => {
    const reload = vi.fn();

    const handled = recoverFromChunkLoadError(new Error('Failed to fetch dynamically imported module'), reload);

    expect(handled).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for an unrelated error', () => {
    const reload = vi.fn();

    const handled = recoverFromChunkLoadError(new Error('Something else went wrong'), reload);

    expect(handled).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload again inside the cooldown window, so a broken deploy cannot loop the tab', () => {
    const reload = vi.fn();

    recoverFromChunkLoadError(new Error('Failed to fetch dynamically imported module'), reload);
    const secondHandled = recoverFromChunkLoadError(new Error('Failed to fetch dynamically imported module'), reload);

    expect(secondHandled).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
