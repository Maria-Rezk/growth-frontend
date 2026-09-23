// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { readStored, writeStored } from '@/lib/storage';
import { scopeDraftKey, useFormDraft, type UseFormDraftOptions } from './useFormDraft';

interface FormValues {
  title: string;
}

function useHarness(key: string | null, defaultValues: FormValues, options?: UseFormDraftOptions) {
  const form = useForm<FormValues>({ defaultValues });
  // Registers the field without mounting an <input> — react-hook-form only
  // tracks a field's dirty/touched state once it has been registered, same
  // as it would be by `{...form.register('title')}` in a real form.
  form.register('title');
  const draft = useFormDraft(key, form, options);
  // react-hook-form's `formState` is a proxy that only keeps a property
  // up to date once something has read it during render — every real form in
  // this app reads `form.formState.isDirty` (or `.errors`) in its own JSX for
  // exactly this reason. Reproducing that here, not just in `useFormDraft`
  // itself, is what makes `isDirty` reflect `setValue` calls below.
  const isDirty = form.formState.isDirty;
  return { form, draft, isDirty };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFormDraft', () => {
  it('restores a saved draft on mount and marks the form dirty', () => {
    writeStored('local', 'growth.draft.post:1', 1, { title: 'From storage' });
    const { result } = renderHook(() => useHarness('post:1', { title: 'Original' }));

    expect(result.current.form.getValues('title')).toBe('From storage');
    expect(result.current.form.formState.isDirty).toBe(true);
    expect(result.current.draft.restored).toBe(true);
  });

  it('does nothing when there is no saved draft', () => {
    const { result } = renderHook(() => useHarness('post:2', { title: 'Original' }));
    expect(result.current.form.getValues('title')).toBe('Original');
    expect(result.current.draft.restored).toBe(false);
  });

  it('saves changes after the debounce while the form is dirty', () => {
    const { result } = renderHook(() => useHarness('post:3', { title: 'Original' }));

    act(() => {
      result.current.form.setValue('title', 'Typed by user', { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });

    const stored = readStored<FormValues>('local', 'growth.draft.post:3', 1);
    expect(stored?.data.title).toBe('Typed by user');
  });

  it('does not save a change that does not mark the form dirty', () => {
    renderHook(() => useHarness('post:4', { title: 'Original' }));
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(readStored('local', 'growth.draft.post:4', 1)).toBeNull();
  });

  it('discard() clears the saved draft', () => {
    const { result } = renderHook(() => useHarness('post:5', { title: 'Original' }));
    act(() => {
      result.current.form.setValue('title', 'Typed', { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(readStored('local', 'growth.draft.post:5', 1)).not.toBeNull();

    act(() => {
      result.current.draft.discard();
    });
    expect(readStored('local', 'growth.draft.post:5', 1)).toBeNull();
  });

  it('drops a draft older than the record\'s own last-updated time, instead of overwriting newer fetched data', () => {
    vi.setSystemTime(1000);
    writeStored('local', 'growth.draft.post:6', 1, { title: 'Stale draft' });

    const { result } = renderHook(() =>
      useHarness('post:6', { title: 'Server value' }, { serverUpdatedAt: new Date(5000) }),
    );

    expect(result.current.form.getValues('title')).toBe('Server value');
    expect(result.current.draft.restored).toBe(false);
    expect(readStored('local', 'growth.draft.post:6', 1)).toBeNull();
  });

  it('never restores over work already typed this session', () => {
    writeStored('local', 'growth.draft.post:7', 1, { title: 'From storage' });

    // The draft starts disabled (no key), then gets attached on a later
    // render — e.g. the record it belongs to only resolves after something
    // else already put the form in a dirty state (a value prefilled from a
    // link, an earlier field the person already edited).
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useHarness(key, { title: 'Original' }),
      { initialProps: { key: null as string | null } },
    );

    act(() => {
      result.current.form.setValue('title', 'Prefilled', { shouldDirty: true });
    });
    expect(result.current.isDirty).toBe(true);

    rerender({ key: 'post:7' });

    expect(result.current.form.getValues('title')).toBe('Prefilled');
    expect(result.current.draft.restored).toBe(false);
  });

  it('is a no-op when key is null', () => {
    const { result } = renderHook(() => useHarness(null, { title: 'Original' }));
    act(() => {
      result.current.form.setValue('title', 'Typed', { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current.draft.restored).toBe(false);
  });
});

describe('scopeDraftKey', () => {
  it('prefixes the key with the user id, so two accounts never collide', () => {
    expect(scopeDraftKey('user-1', 'post-content:42')).toBe('user-1:post-content:42');
    expect(scopeDraftKey('user-2', 'post-content:42')).toBe('user-2:post-content:42');
    expect(scopeDraftKey('user-1', 'post-content:42')).not.toBe(scopeDraftKey('user-2', 'post-content:42'));
  });

  it('disables the draft (returns null) when there is no signed-in user', () => {
    expect(scopeDraftKey(null, 'post-content:42')).toBeNull();
    expect(scopeDraftKey(undefined, 'post-content:42')).toBeNull();
  });
});

describe('per-user isolation', () => {
  it('does not restore one user\'s draft into another user\'s form', () => {
    writeStored('local', `growth.draft.${scopeDraftKey('user-1', 'post-content:42')}`, 1, { title: 'User 1 draft' });

    const { result } = renderHook(() => useHarness(scopeDraftKey('user-2', 'post-content:42'), { title: 'Original' }));

    expect(result.current.form.getValues('title')).toBe('Original');
    expect(result.current.draft.restored).toBe(false);
  });
});
