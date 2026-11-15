// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

afterEach(cleanup);

/** An opener button and a dialog, so focus can be followed out and back. */
function Harness({ children, focusLast = false }: { children: ReactNode; focusLast?: boolean }) {
  const [open, setOpen] = useState(false);
  const last = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        title="Create thing"
        onClose={() => setOpen(false)}
        initialFocusRef={focusLast ? last : undefined}
        footer={<button ref={last} type="button" onClick={() => setOpen(false)}>Done</button>}
      >
        {children}
      </Modal>
    </>
  );
}

async function openDialog(children: ReactNode, focusLast = false) {
  const user = userEvent.setup();
  render(<Harness focusLast={focusLast}>{children}</Harness>);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await screen.findByRole('dialog', { name: 'Create thing' });
  return user;
}

describe('Modal initial focus', () => {
  it('opens on the first field, not the Close button', async () => {
    await openDialog(<><label htmlFor="name">Name</label><input id="name" /><label htmlFor="notes">Notes</label><textarea id="notes" /></>);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Close dialog' })).not.toHaveFocus();
  });

  it('skips hidden file inputs, read-only fields and anything hidden', async () => {
    await openDialog(
      <>
        <input type="file" aria-label="Upload" />
        <input aria-label="Share link" readOnly defaultValue="https://example.test/r/abc" />
        <div hidden><input aria-label="Hidden" /></div>
        <select aria-label="Priority"><option>High</option></select>
      </>,
    );
    await waitFor(() => expect(screen.getByLabelText('Priority')).toHaveFocus());
  });

  it('opens on the dialog itself when it has no field, so its title is announced', async () => {
    await openDialog(<p>Read-only details.</p>);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Create thing' })).toHaveFocus());
  });

  it('lets a caller choose where focus lands', async () => {
    await openDialog(<input aria-label="Name" />, true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus());
  });

  it('hands focus back to the opener on close', async () => {
    const user = await openDialog(<input aria-label="Name" />);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus());
  });
});
