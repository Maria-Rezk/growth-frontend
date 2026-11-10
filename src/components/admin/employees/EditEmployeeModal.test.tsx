// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { PlatformRole, type Employee } from '@/types/domain';

/* The Edit dialog must not be a way round the row's status rules (release guide 1.5). */

const update = vi.fn();
vi.mock('@/services/users', () => ({ usersService: { update: (...args: unknown[]) => update(...args) } }));
vi.mock('@/components/admin/employees/HeldReviewsNotice', () => ({ HeldReviewsNotice: () => null }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { EditEmployeeModal } = await import('./EditEmployeeModal');

const self: Employee = { id: 'me', email: 'me@example.test', fullName: 'Me Myself', platformRole: PlatformRole.SUPER_ADMIN, status: 'ACTIVE', clients: [] };

function setup(canChangeStatus: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfirmProvider>
        <EditEmployeeModal employee={self} canChangeStatus={canChangeStatus} onClose={vi.fn()} />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  update.mockReset().mockResolvedValue(self);
});
afterEach(cleanup);

describe('EditEmployeeModal status field', () => {
  it('leaves status out where the row offers none, and never sends it', async () => {
    const user = setup(false);
    expect(screen.queryByLabelText(/^Status/)).toBeNull();
    const name = screen.getByLabelText(/Full name/);
    await user.clear(name);
    await user.type(name, 'Me Renamed');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('me', { fullName: 'Me Renamed', password: undefined }));
  });

  it('keeps the status field where status may change', () => {
    setup(true);
    expect(screen.getByLabelText(/^Status/)).toBeInTheDocument();
  });
});
