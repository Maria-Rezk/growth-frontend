import { useEffect, useId, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap, type InitialFocus } from '@/hooks/useFocusTrap';
import { CloseIcon } from '@/components/ui/icons';

/*
  Open dialogs, oldest first. Every Modal listens for Escape on `document`, so
  with a confirm open over a form both used to hear the same key press: the
  confirm closed and the form's discard guard asked again at once, so Escape
  could never back out. Only the top of this stack answers Escape.
*/
const openDialogs: symbol[] = [];

function isTopDialog(token: symbol): boolean {
  return openDialogs[openDialogs.length - 1] === token;
}

/*
  The page behind a dialog does not scroll. The lock belongs to the stack, not
  to each dialog: each one used to save `body.style.overflow` when it opened
  and put it back when it closed. With a confirm over a form, the confirm saved
  "hidden" (the form's lock); "Discard" then closed both in one commit, the
  form restored "" first and the confirm restored "hidden" after it, so the
  page stayed locked with no dialog open: no wheel, keyboard or touch scroll
  until a reload. Now the first dialog in takes the lock and the last one out
  releases it, whatever order they close in.
*/
let overflowBeforeLock = '';

function addDialog(token: symbol): void {
  if (openDialogs.length === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogs.push(token);
}

function removeDialog(token: symbol): void {
  const index = openDialogs.indexOf(token);
  if (index === -1) return;
  openDialogs.splice(index, 1);
  if (openDialogs.length === 0) document.body.style.overflow = overflowBeforeLock;
}

/** Real fields only: not a visually hidden file input, a hidden or read-only one. */
const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([readonly])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([readonly])',
].join(',');

/*
  Where a dialog opens. The trap used to take the first focusable element,
  which is always the header's Close button: keyboard users had to Tab past it
  to start typing, and one Enter closed the form. A dialog now opens on its
  first field; with none (a read-only panel), on the dialog itself, so a
  screen reader announces its title. Never on Close.

  So a field inside a dialog does not need `autoFocus` to be focused on open,
  and should not use it: it takes focus before the trap can note who opened
  the dialog, and focus then cannot return there on close. (`autoFocus` on a
  field revealed later, mid-dialog, is fine.)
*/
const firstFieldOrDialog: InitialFocus = (container) => {
  const fields = container.querySelector('.modal__body')?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? [];
  const field = Array.from(fields).find((element) => !element.closest('[hidden], [aria-hidden="true"], fieldset[disabled]'));
  return field ?? container;
};

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  wide = false,
  closeOnBackdrop = true,
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const backdropPressed = useRef(false);
  const titleId = useId();

  // Read through a ref so a parent passing a fresh `onClose` each render does
  // not re-register this dialog — that would move it back to the top of the stack.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useFocusTrap(dialogRef, open, initialFocusRef ?? firstFieldOrDialog);

  useEffect(() => {
    if (!open) return;
    const token = Symbol('dialog');
    addDialog(token);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTopDialog(token)) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      removeDialog(token);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        backdropPressed.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (closeOnBackdrop && backdropPressed.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressed.current = false;
      }}
    >
      <section
        ref={dialogRef}
        className={wide ? 'modal modal--wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Divs, not <header>/<footer> (A-5): rendered in a portal outside <main>,
            a header counted as a second page banner beside the topbar. */}
        <div className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <CloseIcon size={17} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </section>
    </div>,
    document.body,
  );
}