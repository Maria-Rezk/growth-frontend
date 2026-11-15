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
        <Route path="*" element={<Address />} />
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

describe('AcceptInvitationPage account paths (N-10)', () => {
  const account = () => screen.getByRole('group', { name: 'Do you already have an account?' });

  it('asks first, defaulting to an existing account, with no name or password asked for', () => {
    at('/accept-invitation?token=inv-1.secret');
    expect(account()).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yes, I have an account' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No, create my account' })).not.toBeChecked();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(account()).toHaveAccessibleDescription('Accept, then sign in with your usual email and password.');
  });

  it('existing account: sends the token alone, even after a name and password were typed and abandoned', async () => {
    at('/accept-invitation?token=inv-1.secret');
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'No, create my account' }));
    await user.type(screen.getByLabelText('Full name'), 'Half Typed');
    await user.type(screen.getByLabelText('Password'), 'not-sent-password');
    await user.click(screen.getByRole('radio', { name: 'Yes, I have an account' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ token: 'inv-1.secret', fullName: undefined, password: undefined }));
    // Not signed in by the accept call: they go to sign in.
    await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent(/^\/login$/));
  });

  it('new account: name and password appear, are required, and are both validated before sending', async () => {
    at('/accept-invitation?token=inv-1.secret');
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'No, create my account' }));
    const name = screen.getByLabelText('Full name');
    const password = screen.getByLabelText('Password');
    expect(name).toHaveAttribute('aria-required', 'true');
    expect(password).toHaveAttribute('aria-required', 'true');
    // Neither says "(optional)", and the old "leave blank" advice is gone.
    expect(screen.queryByText(/\(optional\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Leave blank/)).not.toBeInTheDocument();
    expect(password).toHaveAccessibleDescription('At least 12 characters.');

    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('Full name is required for a new account.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 12 characters.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Full name is required for a new account.');
    expect(acceptInvitation).not.toHaveBeenCalled();

    await user.type(name, 'New Person');
    await user.type(password, 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ token: 'inv-1.secret', fullName: 'New Person', password: 'long-enough-password' }));
  });

  it('new account, signed in by the accept call: goes into the app, not to the sign-in page', async () => {
    acceptInvitation.mockResolvedValue({ accepted: true, authenticated: true });
    at('/accept-invitation?token=inv-1.secret');
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'No, create my account' }));
    await user.type(screen.getByLabelText('Full name'), 'New Person');
    await user.type(screen.getByLabelText('Password'), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(screen.getByTestId('address')).not.toHaveTextContent(/accept-invitation|login/));
  });

  it('reports a missing token and a missing name together', async () => {
    at('/accept-invitation');
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'No, create my account' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('Invitation token is required.')).toBeInTheDocument();
    expect(screen.getByText('Full name is required for a new account.')).toBeInTheDocument();
  });
});
