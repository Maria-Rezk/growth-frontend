// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { LocaleProvider } from '@/context/LocaleProvider';
import { PlatformRole, type Employee } from '@/types/domain';

/*
  The Employees page's action visibility, rendered (release guide 1.5): an
  Agency Admin may change nothing on a Super Admin account, and nobody is
  offered their own status. Hiding is cosmetic; the API answers 403 regardless.
*/

const viewer = vi.hoisted(() => ({ id: 'agency', platformRole: 'AGENCY_ADMIN' as string }));
const person = (id: string, fullName: string, platformRole: PlatformRole): Employee => ({
  id, email: `${id}@example.test`, fullName, platformRole, status: 'ACTIVE', clients: [],
});
const team = vi.hoisted(() => [] as Employee[]);
team.push(
  person('agency', 'Ada Agency', PlatformRole.AGENCY_ADMIN),
  person('super', 'Sam Super', PlatformRole.SUPER_ADMIN),
  person('super-2', 'Sue Super', PlatformRole.SUPER_ADMIN),
  person('staff', 'Dana Staff', PlatformRole.USER),
);

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: viewer.id, email: `${viewer.id}@example.test`, platformRole: viewer.platformRole } }),
}));
vi.mock('@/components/layout/RequireAdmin', () => ({ RequireAdmin: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/services/users', () => ({ usersService: { list: vi.fn(async () => team), update: vi.fn() } }));
vi.mock('@/components/admin/employees/HeldReviewsNotice', () => ({ HeldReviewsNotice: () => null }));

const { EmployeesPage } = await import('./EmployeesPage');

function setup(as: { id: string; platformRole: string }) {
  Object.assign(viewer, as);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocaleProvider>
        <ConfirmProvider>
          <EmployeesPage />
        </ConfirmProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

/** One person's table row. */
async function rowOf(name: string) {
  const row = (await screen.findByText(name)).closest('tr');
  if (!row) throw new Error(`No row for ${name}`);
  return within(row);
}

const STATUS = /^(Deactivate|Activate) /;

afterEach(cleanup);

describe('Employees page action visibility', () => {
  it('Agency Admin: nothing that changes a Super Admin account — no Edit (name, password), no status', async () => {
    setup({ id: 'agency', platformRole: 'AGENCY_ADMIN' });
    const superRow = await rowOf('Sam Super');
    expect(superRow.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(superRow.queryByRole('button', { name: STATUS })).toBeNull();
    expect(superRow.queryByRole('button', { name: 'Platform role' })).toBeNull();
  });

  it('Agency Admin: an ordinary employee keeps Edit and Deactivate', async () => {
    setup({ id: 'agency', platformRole: 'AGENCY_ADMIN' });
    const staffRow = await rowOf('Dana Staff');
    expect(staffRow.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(staffRow.getByRole('button', { name: 'Assign to client' })).toBeInTheDocument();
    expect(staffRow.getByRole('button', { name: 'Deactivate Dana Staff' })).toBeEnabled();
  });

  it('Agency Admin: their own row keeps Edit but has no status action', async () => {
    setup({ id: 'agency', platformRole: 'AGENCY_ADMIN' });
    const own = await rowOf('Ada Agency');
    expect(own.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(own.queryByRole('button', { name: STATUS })).toBeNull();
  });

  it('Super Admin: every action on another Super Admin, and no status on their own row', async () => {
    setup({ id: 'super', platformRole: 'SUPER_ADMIN' });
    const other = await rowOf('Sue Super');
    expect(other.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(other.getByRole('button', { name: 'Platform role' })).toBeInTheDocument();
    expect(other.getByRole('button', { name: 'Deactivate Sue Super' })).toBeEnabled();
    const own = await rowOf('Sam Super');
    expect(own.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(own.queryByRole('button', { name: STATUS })).toBeNull();
  });
});
