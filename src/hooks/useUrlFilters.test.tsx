// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useUrlFilters } from './useDashboardFilters';

const DEFAULTS = { status: '', search: '', view: 'board' };

function wrapper(initial: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
}

function useHarness() {
  const [values, set, reset] = useUrlFilters(DEFAULTS);
  const location = useLocation();
  return { values, set, reset, search: location.search };
}

describe('useUrlFilters', () => {
  it('reads filters from the URL, falling back to defaults', () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/tasks?status=DONE') });
    expect(result.current.values).toEqual({ status: 'DONE', search: '', view: 'board' });
  });

  it('writes a change to the URL and drops values equal to their default', () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/tasks') });

    act(() => result.current.set({ status: 'TODO', view: 'table' }));
    expect(result.current.search).toBe('?status=TODO&view=table');

    // Back to the default view: the key disappears, so a clean page has a clean URL.
    act(() => result.current.set({ view: 'board' }));
    expect(result.current.search).toBe('?status=TODO');
  });

  it('leaves keys it does not own alone', () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/tasks?utm=x') });
    act(() => result.current.set({ status: 'TODO' }));
    expect(result.current.search).toContain('utm=x');
    act(() => result.current.reset());
    expect(result.current.search).toBe('?utm=x');
  });

  /*
    REGRESSION (N-6): two updates in one event. The Leads setters set a filter
    and then page=1; the second update started from the last-rendered URL and
    erased the first, so no Leads filter ever applied.
  */
  it('keeps both of two updates made in the same event', () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/leads?view=table') });
    act(() => {
      result.current.set({ status: 'INTERESTED' });
      result.current.set({ search: 'Nour' });
    });
    expect(result.current.values).toEqual({ status: 'INTERESTED', search: 'Nour', view: 'table' });
  });

  it('lets a later update in the same event override an earlier one for the same key', () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/leads') });
    act(() => {
      result.current.set({ status: 'NEW' });
      result.current.set({ status: 'WON' });
    });
    expect(result.current.search).toBe('?status=WON');
  });

  it('starts from the current URL again on the next event, not a stale pending one', async () => {
    const { result } = renderHook(useHarness, { wrapper: wrapper('/leads') });
    act(() => result.current.set({ status: 'NEW' }));
    act(() => result.current.reset());
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.set({ search: 'x' }));
    expect(result.current.search).toBe('?search=x');
  });
});
