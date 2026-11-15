// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { LocaleProvider } from '@/context/LocaleProvider';
import { CompanyMembershipRole, PlatformRole, type Company, type Membership } from '@/types/domain';

const removeMember = vi.fn();
const refreshMemberships = vi.fn();
const member: Membership = {
  id: 'm1',
  userId: 'u1',
  companyId: 'c1',
  roles: [CompanyMembershipRole.DESIGNER],
  status: 'ACTIVE',
  user: { id: 'u1', email: 'dana@example.test', fullName: 'Dana' },
} as Membership;

vi.mock('@/services/companies', () => ({
  companiesService: {
    members: vi.fn(async () => [member]),
    removeMember: (...args: unknown[]) => removeMember(...args),
    update: vi.fn(),
    updateMember: vi.fn(),
    addMember: vi.fn(),
  },
}));
vi.mock('@/services/users', () => ({
  usersService: { list: vi.fn(async () => [{ id: 'u1', email: 'dana@example.test', fullName: 'Dana', clients: [] }]) },
}));
vi.mock('@/context/CompanyContext', () => ({
  useCompany: () => ({ activeCompanyId: 'c1', refreshMemberships, refreshCompanies: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin', email: 'a@example.test', platformRole: PlatformRole.AGENCY_ADMIN } }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { ClientDetailPanel } from './ClientDetailPanel';

const client = { id: 'c1', name: 'Acme Hotel', status: 'ACTIVE' } as Company;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
      <ConfirmProvider>
        <ClientDetailPanel client={client} onClose={vi.fn()} onRequestDelete={vi.fn()} />
      </ConfirmProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const removeButton = () => screen.findByRole('button', { name: 'Remove Dana from Acme Hotel' });
const confirmDialog = () => screen.findByRole('dialog', { name: 'Remove from client' });

beforeEach(() => {
  removeMember.mockReset();
  refreshMemberships.mockReset();
  toast.success.mockReset();
});
afterEach(cleanup);

describe('ClientDetailPanel — removing a member (FG-03)', () => {
  it('asks before removing, and Cancel sends nothing', async () => {
    const user = setup();
    await user.click(await removeButton());
    const dialog = await confirmDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(removeMember).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('removes once confirmed, reports success and refreshes own roles', async () => {
    removeMember.mockResolvedValue(undefined);
    const user = setup();
    await user.click(await removeButton());
    await user.click(within(await confirmDialog()).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('c1', 'm1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dana removed from Acme Hotel.'));
    expect(removeMember).toHaveBeenCalledTimes(1);
    expect(refreshMemberships).toHaveBeenCalled();
  });

  it('shows no success toast when the DELETE fails', async () => {
    removeMember.mockRejectedValue({ message: 'Forbidden resource' });
    const user = setup();
    await user.click(await removeButton());
    await user.click(within(await confirmDialog()).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('un-ticking the last role asks for confirmation instead of removing silently', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Change roles for Dana' }));
    const checklist = screen.getByRole('group', { name: 'Roles for Dana' });
    await user.click(within(checklist).getByRole('checkbox', { checked: true }));
    const dialog = await confirmDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(removeMember).not.toHaveBeenCalled();
  });
});
