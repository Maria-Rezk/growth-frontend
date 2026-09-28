// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readStored, writeStored } from '@/lib/storage';
import { useScrollRestoration } from './useScrollRestoration';

function Harness() {
  useScrollRestoration();
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  // requestAnimationFrame runs synchronously in these tests — the restore
  // effect's "wait a frame" is an implementation detail, not something the
  // test needs to model.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('useScrollRestoration', () => {
  it('restores a saved scroll position for the current path + query on mount', () => {
    writeStored('session', 'scroll:/tasks?status=DONE', 1, 320);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderAt('/tasks?status=DONE');

    expect(scrollTo).toHaveBeenCalledWith(0, 320);
  });

  it('scrolls to the top for a path with no saved position', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderAt('/tasks');

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does not mix up two different paths', () => {
    writeStored('session', 'scroll:/tasks', 1, 100);
    writeStored('session', 'scroll:/leads', 1, 500);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderAt('/leads');

    expect(scrollTo).toHaveBeenCalledWith(0, 500);
  });

  describe('when the page is still loading (too short to reach the saved position)', () => {
    let resize: (() => void) | null = null;
    let scrollHeight = 500;

    beforeEach(() => {
      resize = null;
      scrollHeight = 500;
      vi.stubGlobal('ResizeObserver', class {
        constructor(callback: () => void) { resize = callback; }
        observe() {}
        disconnect() {}
      });
      vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    });

    it('waits for the page to grow, then restores', () => {
      writeStored('session', 'scroll:/tasks', 1, 900);
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

      renderAt('/tasks');
      expect(scrollTo).not.toHaveBeenCalled();

      scrollHeight = 2000;
      act(() => resize?.());
      expect(scrollTo).toHaveBeenCalledWith(0, 900);
    });

    it('gives up if the person scrolls first, so it never yanks them back', () => {
      writeStored('session', 'scroll:/tasks', 1, 900);
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

      renderAt('/tasks');
      act(() => {
        window.dispatchEvent(new Event('wheel'));
      });
      scrollHeight = 2000;
      act(() => resize?.());

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it('saves the scroll position, debounced, as the page scrolls', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderAt('/tasks');

    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(readStored<number>('session', 'scroll:/tasks', 1)?.data).toBe(240);
    vi.useRealTimers();
  });

  it('drops the entry when the page scrolls back to the top', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    writeStored('session', 'scroll:/tasks', 1, 240);
    renderAt('/tasks');

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(readStored('session', 'scroll:/tasks', 1)).toBeNull();
    vi.useRealTimers();
  });
});
