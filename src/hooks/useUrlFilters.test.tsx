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
});
