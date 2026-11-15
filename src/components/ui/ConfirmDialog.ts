import { createContext, useContext, type ReactNode } from 'react';
import type { ButtonVariant } from '@/components/ui/Button';

/*
  The confirm hook and its options, apart from ConfirmProvider, which renders
  the dialog (F-31): a module that exports only components keeps its state
  across Fast Refresh. Callers import useConfirm from here, as before.
*/

export interface ConfirmOptions {
  title: string;
  /** What happens if they say yes — including what cannot be undone. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that deletes or cancels; `primary` for a step that is merely worth a second look. */
  tone?: Extract<ButtonVariant, 'primary' | 'danger'>;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.');
  return confirm;
}
