// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { PlatformRole, type Employee } from '@/types/domain';

const update = vi.fn();
vi.mock('@/services/users', () => ({ usersService: { update: (...args: unknown[]) => update(...args) } }));
vi.mock('@/components/admin/employees/HeldReviewsNotice', () => ({ HeldReviewsNotice: () => <p>held-reviews</p> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { EmployeeStatusAction } from './EmployeeStatusAction';

const employee = (status: string): Employee => ({
  id: 'u1', email: 'dana@example.test', fullName: 'Dana', platformRole: PlatformRole.USER, status, clients: [],
});

function setup(target: Employee, blockedReason: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <EmployeeStatusAction employee={target} blockedReason={blockedReason} />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  update.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe('EmployeeStatusAction (FG-07)', () => {
  it('asks before deactivating, and does nothing on Cancel', async () => {
    const user = setup(employee('ACTIVE'));
    await user.click(screen.getByRole('button', { name: 'Deactivate Dana' }));
    expect(await screen.findByText(/this is not a deletion/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('PATCHes status INACTIVE once confirmed, and only then reports success', async () => {
    update.mockResolvedValue({ ...employee('INACTIVE') });
    const user = setup(employee('ACTIVE'));
    await user.click(screen.getByRole('button', { name: 'Deactivate Dana' }));
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('u1', { status: 'INACTIVE' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dana deactivated.'));
  });

  it('shows the server error and no success toast when the PATCH fails', async () => {
    update.mockRejectedValue({ message: 'Forbidden resource' });
    const user = setup(employee('ACTIVE'));
    await user.click(screen.getByRole('button', { name: 'Deactivate Dana' }));
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Forbidden resource'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers Activate for an inactive employee and restores ACTIVE', async () => {
    update.mockResolvedValue({ ...employee('ACTIVE') });
    const user = setup(employee('INACTIVE'));
    await user.click(screen.getByRole('button', { name: 'Activate Dana' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('u1', { status: 'ACTIVE' }));
  });

  it('disables Deactivate and states why when blocked', () => {
    setup(employee('ACTIVE'), 'You cannot deactivate your own account.');
    const button = screen.getByRole('button', { name: 'Deactivate Dana' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('You cannot deactivate your own account.');
  });
});
