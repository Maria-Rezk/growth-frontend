import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './ConfirmDialog';

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
  const cancelButton = useRef<HTMLButtonElement>(null);
  // A destructive ask opens on Cancel: Enter straight after it appears must
  // not delete or discard anything. A merely-worth-a-look ask opens on Confirm.
  const danger = pending?.tone === 'danger';

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
        initialFocusRef={danger ? cancelButton : confirmButton}
        footer={
          <>
            <Button ref={cancelButton} variant="secondary" type="button" onClick={() => settle(false)}>
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
