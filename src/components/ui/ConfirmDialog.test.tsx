// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { useConfirm } from './ConfirmDialog';
import { ConfirmProvider } from './ConfirmProvider';
import { Modal } from './Modal';

function Harness() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState<string>('unasked');
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({ title: 'Delete it?', message: 'Gone for good.', confirmLabel: 'Delete', tone: 'danger' });
          setAnswer(ok ? 'yes' : 'no');
        }}
      >
        Ask
      </button>
      <output>{answer}</output>
    </>
  );
}

function setup() {
  render(<ConfirmProvider><Harness /></ConfirmProvider>);
  return userEvent.setup();
}

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('resolves true on the confirm button', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Gone for good.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('yes'));
    expect(screen.queryByText('Gone for good.')).not.toBeInTheDocument();
  });

  it('resolves false on Cancel', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no'));
  });

  it('resolves false on Escape', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Gone for good.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no'));
  });

  it('opens a destructive ask on Cancel, so Enter does not destroy anything', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancelButton).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('no'));
  });

  it('opens a non-destructive ask on the confirm button', async () => {
    function PrimaryHarness() {
      const confirm = useConfirm();
      return <button type="button" onClick={() => void confirm({ title: 'Send it?', message: 'Goes to the client.', confirmLabel: 'Send' })}>Ask</button>;
    }
    const user = userEvent.setup();
    render(<ConfirmProvider><PrimaryHarness /></ConfirmProvider>);
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const sendButton = await screen.findByRole('button', { name: 'Send' });
    await waitFor(() => expect(sendButton).toHaveFocus());
  });

  it('Escape on a confirm over a form closes only the confirm', async () => {
    function FormWithGuard() {
      const confirm = useConfirm();
      const [open, setOpen] = useState(true);
      // The form re-renders on its own once the confirm is up (as a real form
      // does on any state change), so it re-registers after the confirm did.
      const [asking, setAsking] = useState(false);
      const [, setTick] = useState(0);
      useEffect(() => {
        if (asking) setTick((tick) => tick + 1);
      }, [asking]);
      const guardedClose = async () => {
        setAsking(true);
        const ok = await confirm({ title: 'Discard changes?', message: 'Unsaved work.', confirmLabel: 'Discard', tone: 'danger' });
        setAsking(false);
        if (ok) setOpen(false);
      };
      return (
        <Modal open={open} title="Create task" onClose={() => void guardedClose()}>
          <input aria-label="Title" defaultValue="Half-written" />
        </Modal>
      );
    }
    const user = userEvent.setup();
    render(<ConfirmProvider><FormWithGuard /></ConfirmProvider>);
    await screen.findByRole('dialog', { name: 'Create task' });

    await user.keyboard('{Escape}');
    await screen.findByRole('dialog', { name: 'Discard changes?' });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Create task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Half-written');
  });
});
