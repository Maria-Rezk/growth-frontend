import { useEffect, useRef, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { clearStored, readStored, writeStored } from '@/lib/storage';

const DRAFT_VERSION = 1;
const SAVE_DEBOUNCE_MS = 800;
/** A draft older than this is more likely abandoned than worth restoring. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface UseFormDraftOptions {
  /** Skip restoring/saving — e.g. the record this form edits hasn't loaded yet. */
  enabled?: boolean;
  /**
   * The record's own last-modified time, if it has one. A saved draft older
   * than this has already been superseded by what the server has now (by
   * this person, another tab, or someone else) — restoring it would silently
   * discard newer data, so it is dropped instead.
   */
  serverUpdatedAt?: string | number | Date | null;
  ttlMs?: number;
}

export interface FormDraftHandle {
  /** True once a saved draft was found and applied. */
  restored: boolean;
  /** Deletes the saved draft. Call after a successful submit. */
  discard: () => void;
}

/**
 * Prefixes a draft key with the signed-in user's id, so one account's draft
 * never surfaces in another account's session on the same browser — two
 * people (or the same person, signed out and back in as someone else) never
 * share a key just because they happen to edit the same record.
 *
 * Deliberately not read inside `useFormDraft` itself (which would need
 * `useAuth`, and so a mounted `AuthProvider`, for every caller including
 * tests) — callers already have `user` from `useAuth()` for other reasons.
 * Returns `null` (disabling the draft) when there is no signed-in user yet.
 */
export function scopeDraftKey(userId: string | null | undefined, suffix: string): string | null {
  return userId ? `${userId}:${suffix}` : null;
}

/**
 * Whether a draft is saved for `key`, without mounting the form that owns it.
 *
 * For a screen where editing is opt-in (e.g. a post's content is read-only
 * until "Edit" is clicked): checking this lets the page reopen the editor by
 * itself after a refresh, instead of leaving a restorable draft invisible
 * behind a button the person has to remember to click again.
 */
export function hasFormDraft(key: string): boolean {
  return readStored('local', `growth.draft.${key}`, DRAFT_VERSION) !== null;
}

/**
 * Debounced localStorage backup of a react-hook-form form, restored on mount.
 *
 * `key` should identify the record being edited (e.g. `post-content:${postId}`)
 * so a draft never leaks onto an unrelated record. Pass `null` to disable
 * entirely (e.g. a create form with nothing yet to key on).
 *
 * Restoring never overwrites work already in progress: it only applies when
 * the form is still pristine, and only once per key. Saving only writes while
 * the form is dirty, so a clean form does not keep refreshing a stale draft's
 * timestamp.
 */
export function useFormDraft<T extends FieldValues>(
  key: string | null,
  form: UseFormReturn<T>,
  options: UseFormDraftOptions = {},
): FormDraftHandle {
  const { enabled = true, serverUpdatedAt = null, ttlMs = DEFAULT_TTL_MS } = options;
  const storageKey = key ? `growth.draft.${key}` : null;
  const [restored, setRestored] = useState(false);
  const appliedForKeyRef = useRef<string | null>(null);

  /*
    react-hook-form's `formState` is a proxy that only keeps a given property
    (isDirty, errors, ...) up to date once something has read it — reading it
    only inside a later `useEffect` can be too late, if some other effect on
    the same form changes a value first. Reading it here, in the hook's own
    render (not an effect), guarantees the read happens before every effect
    below — including ones the calling component declares — regardless of
    whether that component's JSX happens to read `isDirty` itself.
  */
  void form.formState.isDirty;

  useEffect(() => {
    if (!storageKey || !enabled) return;
    if (appliedForKeyRef.current === storageKey) return;
    appliedForKeyRef.current = storageKey;

    const stored = readStored<T>('local', storageKey, DRAFT_VERSION);
    if (!stored) return;

    const serverTime = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : null;
    if (serverTime !== null && Number.isFinite(serverTime) && stored.savedAt < serverTime) {
      clearStored('local', storageKey);
      return;
    }

    // Never stomp something already typed this session.
    if (form.formState.isDirty) return;

    // keepDefaultValues: isDirty is computed against the record's original
    // values, so a restored draft correctly shows as unsaved work rather
    // than a clean form — the Save button enables and the unsaved-changes
    // guard applies, same as if the person had just typed it.
    form.reset(stored.data, { keepDefaultValues: true });
    setRestored(true);
    // Only re-run when the key itself changes; form/serverUpdatedAt identity
    // churns every render and would otherwise fight `appliedForKeyRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled]);

  useEffect(() => {
    if (!storageKey || !enabled) return;
    let timer: number | undefined;

    const subscription = form.watch((values) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (form.formState.isDirty) {
          writeStored('local', storageKey, DRAFT_VERSION, values as T, ttlMs);
        }
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [enabled, form, storageKey, ttlMs]);

  const discard = () => {
    setRestored(false);
    if (storageKey) clearStored('local', storageKey);
  };

  return { restored, discard };
}
