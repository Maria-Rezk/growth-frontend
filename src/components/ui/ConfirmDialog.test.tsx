// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

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

  it('puts focus on the confirm button so Enter is a deliberate yes', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const confirmButton = await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(confirmButton).toHaveFocus());
  });
});
