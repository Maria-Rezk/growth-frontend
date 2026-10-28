// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const login = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login, isAuthenticated: false, error: null }),
}));

import { LoginPage } from './LoginPage';

function setup() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const password = () => screen.getByLabelText('Password', { exact: true }) as HTMLInputElement;
const toggle = () => screen.getByRole('checkbox', { name: 'Show password' });

beforeEach(() => {
  login.mockReset();
  login.mockResolvedValue(true);
});

afterEach(cleanup);

describe('LoginPage password visibility', () => {
  it('starts hidden, with the password-manager hint kept', () => {
    setup();
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toHaveAttribute('aria-controls', 'password');
  });

  it('shows and hides the password, keeping what was typed', async () => {
    const user = setup();
    await user.type(password(), 'correct horse');
    await user.click(toggle());
    expect(password()).toHaveAttribute('type', 'text');
    expect(password()).toHaveValue('correct horse');
    await user.click(toggle());
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveValue('correct horse');
  });

  it('toggles from the keyboard with Space', async () => {
    const user = setup();
    toggle().focus();
    await user.keyboard(' ');
    expect(password()).toHaveAttribute('type', 'text');
  });

  it('still submits with Enter in the password field, shown or hidden', async () => {
    const user = setup();
    await user.type(screen.getByLabelText('Email'), 'person@example.test');
    await user.click(toggle());
    await user.type(password(), 'secret-password{Enter}');
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'person@example.test', password: 'secret-password' }));
  });
});
