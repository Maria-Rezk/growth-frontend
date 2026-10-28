// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const acceptInvitation = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ acceptInvitation, isAuthenticated: false, error: null }),
}));

import { AcceptInvitationPage } from './AcceptInvitationPage';

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/accept-invitation" element={<><AcceptInvitationPage /><Address /></>} />
        <Route path="/login" element={<Address />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  acceptInvitation.mockReset();
  acceptInvitation.mockResolvedValue({ accepted: true, authenticated: false });
});

afterEach(cleanup);

describe('AcceptInvitationPage', () => {
  it('drops the token from the address bar once it has read it', async () => {
    at('/accept-invitation?token=inv-1.secret');
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/accept-invitation$/));
  });

  it('does not show a link token as an editable field', () => {
    at('/accept-invitation?token=inv-1.secret');
    expect(screen.queryByLabelText('Invitation token')).not.toBeInTheDocument();
    expect(screen.getByText('Your invitation link has been recognised.')).toBeInTheDocument();
  });

  it('still sends the link token after the address bar was cleaned', async () => {
    at('/accept-invitation?token=inv-1.secret');
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/accept-invitation$/));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ token: 'inv-1.secret', fullName: undefined, password: undefined }));
  });

  it('unwraps a full accept link pasted in as the token', async () => {
    at(`/accept-invitation?token=${encodeURIComponent('https://app.example.test/accept-invitation?token=inv-2.secret')}`);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith(expect.objectContaining({ token: 'inv-2.secret' })));
  });

  it('can reveal the field, filled with the link token, to use a different one', async () => {
    at('/accept-invitation?token=inv-1.secret');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use a different invitation token' }));
    expect(screen.getByLabelText('Invitation token')).toHaveValue('inv-1.secret');
  });

  it('asks for the token when there is no link', async () => {
    at('/accept-invitation');
    const user = userEvent.setup();
    expect(screen.getByLabelText('Invitation token')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('Invitation token is required.')).toBeInTheDocument();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});
