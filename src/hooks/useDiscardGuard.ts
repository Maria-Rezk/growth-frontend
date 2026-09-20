import { useCallback } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

/**
 * Protects a form's unsaved work on the two ways out that lose it.
 *
 * - A tab close or reload gets the browser's own "leave site?" prompt while
 *   the form is dirty and on screen.
 * - `discard(close)` wraps a modal's Cancel / backdrop / Escape: it asks
 *   first when there is something to lose, and just closes when there is
 *   not. The save path keeps calling `close()` directly — a successful
 *   submit is not a discard.
 */
export function useDiscardGuard<T extends FieldValues>(form: UseFormReturn<T>, active = true) {
  const confirm = useConfirm();
  const dirty = active && form.formState.isDirty;
  useUnsavedChangesWarning(dirty);

  return useCallback(
    (close: () => void) => async () => {
      if (!form.formState.isDirty) {
        close();
        return;
      }
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'What you typed here has not been saved and will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (ok) close();
    },
    [confirm, form],
  );
}
