// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Membership } from '@/types/domain';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const members = vi.fn();
vi.mock('@/services/companies', () => ({
  companiesService: {
    list: vi.fn(async () => [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }]),
    members: (companyId: string) => members(companyId),
  },
}));

import { CompanyProvider, useCompany } from './CompanyContext';

const membership = (companyId: string, role: Membership['role']): Membership =>
  ({ id: `m-${companyId}`, companyId, userId: 'u1', roles: [role], role, status: 'ACTIVE' }) as Membership;

let context: ReturnType<typeof useCompany>;
function Probe() {
  context = useCompany();
  return null;
}

/** A promise the test resolves by hand, to control the order responses land in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('growth.activeCompanyId', 'A');
  members.mockReset();
});

afterEach(cleanup);

describe('CompanyContext — switching clients', () => {
  it('ignores a slow member list for the client just left', async () => {
    const forA = deferred<Membership[]>();
    const forB = deferred<Membership[]>();
    members.mockImplementation((id: string) => (id === 'A' ? forA.promise : forB.promise));

    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(members).toHaveBeenCalledWith('A'));

    act(() => context.setActiveCompanyId('B'));

    // B answers first, then the stale answer for A arrives.
    await act(async () => { forB.resolve([membership('B', 'DESIGNER')]); });
    await act(async () => { forA.resolve([membership('A', 'ACCOUNT_MANAGER')]); });

    await waitFor(() => expect(context.activeCompanyId).toBe('B'));
    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });
});
