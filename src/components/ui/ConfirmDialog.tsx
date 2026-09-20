import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmOptions {
  title: string;
  /** What happens if they say yes — including what cannot be undone. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that deletes or cancels; `primary` for a step that is merely worth a second look. */
  tone?: Extract<ButtonVariant, 'primary' | 'danger'>;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * `const ok = await confirm({ … })` — the app's own confirm dialog.
 *
 * Replaces `window.confirm`, which cannot be styled, opens with the origin
 * in its title bar ("localhost:5173 says"), ignores the theme, and is not
 * keyboard-consistent with the app's other dialogs. This one is the same
 * `Modal` every other dialog uses, with a danger button when the action is
 * destructive. The promise resolves `false` on Cancel, Escape and backdrop.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // A second ask while one is open answers the first with "no" — the
    // caller that raced is the one that should back off.
    resolver.current?.(false);
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={pending !== null}
        title={pending?.title ?? ''}
        onClose={() => settle(false)}
        initialFocusRef={confirmButton}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => settle(false)}>
              {pending?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button ref={confirmButton} variant={pending?.tone ?? 'primary'} type="button" onClick={() => settle(true)}>
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="confirm-dialog__message">{pending?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.');
  return confirm;
}
