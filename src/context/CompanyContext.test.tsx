// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Company, Membership, PlatformRole } from '@/types/domain';

type AuthState = {
  user: { id: string; platformRole?: PlatformRole } | null;
  sessionMemberships: Membership[] | null;
  reloadUser: ReturnType<typeof vi.fn>;
};
let auth: AuthState;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const members = vi.fn();
const list = vi.fn();
vi.mock('@/services/companies', () => ({
  companiesService: {
    list: () => list(),
    members: (companyId: string) => members(companyId),
  },
}));

import { CompanyProvider, useCompany } from './CompanyContext';

const ALL: Company[] = [
  { id: 'A', name: 'Alpha' } as Company,
  { id: 'B', name: 'Beta' } as Company,
  { id: 'C', name: 'Gamma' } as Company,
];

const membership = (
  companyId: string,
  roles: Membership['roles'],
  extra: Partial<Membership> = {},
): Membership => ({ id: `m-${companyId}`, companyId, userId: 'u1', roles, role: roles[0], status: 'ACTIVE', ...extra }) as Membership;

let context: ReturnType<typeof useCompany>;
function Probe() {
  context = useCompany();
  return null;
}
const mount = () => render(<CompanyProvider><Probe /></CompanyProvider>);

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
  list.mockReset();
  list.mockResolvedValue(ALL);
  auth = { user: { id: 'u1', platformRole: 'USER' }, sessionMemberships: null, reloadUser: vi.fn(async () => undefined) };
});

afterEach(cleanup);

describe('roles from the session (/auth/me memberships)', () => {
  it('give a Designer her roles without ever touching the member directory', async () => {
    auth.sessionMemberships = [membership('A', ['DESIGNER'], { company: ALL[0] })];
    mount();

    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    // The directory is Account Manager / admin only: asking for it is exactly the 403 this design avoids.
    expect(members).not.toHaveBeenCalled();
  });

  it('are per client: switching never carries one client\'s roles into another', async () => {
    auth.sessionMemberships = [
      membership('A', ['ACCOUNT_MANAGER'], { company: ALL[0] }),
      membership('B', ['CLIENT_REVIEWER'], { company: ALL[1] }),
    ];
    mount();
    await waitFor(() => expect(context.activeCompanyId).toBe('A'));
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(true);

    // Read in the very render the switch lands in: there is no in-between state to inherit from.
    act(() => context.setActiveCompanyId('B'));
    expect(context.activeCompanyId).toBe('B');
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(context.hasRole('CLIENT_REVIEWER')).toBe(true);
  });

  it('treat several roles on one membership as a union', async () => {
    auth.sessionMemberships = [membership('A', ['DESIGNER', 'COPYWRITER'], { company: ALL[0] })];
    mount();
    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.hasRole('COPYWRITER')).toBe(true);
    expect(context.hasRole('DESIGNER', 'SALES_AGENT')).toBe(true);
    expect(context.hasRole('SALES_AGENT')).toBe(false);
  });

  it('list only the clients the person is ACTIVE on, and give nothing for a suspended one', async () => {
    auth.sessionMemberships = [
      membership('A', ['DESIGNER'], { company: ALL[0] }),
      membership('B', ['ACCOUNT_MANAGER'], { company: ALL[1], status: 'SUSPENDED' }),
    ];
    window.localStorage.setItem('growth.activeCompanyId', 'B');
    mount();

    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.companies.map((company) => company.id)).toEqual(['A']);
    // The stored choice (B) is no longer reachable, so the first reachable client wins.
    expect(context.activeCompanyId).toBe('A');
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });

  it('read the client details only when the memberships do not embed them, and keep just the person\'s own', async () => {
    auth.sessionMemberships = [membership('B', ['SALES_AGENT'])];
    mount();

    await waitFor(() => expect(context.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);
    expect(context.companies.map((company) => company.id)).toEqual(['B']);
  });

  it('are unknown, not empty-and-trusted, when the memberships say nothing about the client', async () => {
    auth.sessionMemberships = [];
    mount();
    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.companies).toEqual([]);
    expect(context.activeCompanyId).toBeNull();
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });

  it('are re-read from the session, not the directory, when roles change', async () => {
    auth.sessionMemberships = [membership('A', ['DESIGNER'], { company: ALL[0] })];
    mount();
    await waitFor(() => expect(context.loading).toBe(false));

    await act(async () => { await context.refreshMemberships(); });

    expect(auth.reloadUser).toHaveBeenCalledWith({ silent: true });
    expect(members).not.toHaveBeenCalled();
  });
});

describe('platform admins', () => {
  it('see every client with no membership, and the directory is not needed for their roles', async () => {
    auth.user = { id: 'admin', platformRole: 'AGENCY_ADMIN' };
    auth.sessionMemberships = [];
    mount();

    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.companies.map((company) => company.id)).toEqual(['A', 'B', 'C']);
    expect(context.currentMembership).toBeNull();
    expect(members).not.toHaveBeenCalled();
  });
});

describe('one person\'s data is never shown to the next', () => {
  it('drops the previous person\'s clients the moment the identity changes', async () => {
    auth.sessionMemberships = [membership('A', ['DESIGNER'], { company: ALL[0] })];
    const view = mount();
    await waitFor(() => expect(context.companies.map((company) => company.id)).toEqual(['A']));

    // Somebody else signs in on this tab (another tab did it): their memberships have not arrived with the new identity.
    auth = { ...auth, user: { id: 'u2', platformRole: 'USER' }, sessionMemberships: null };
    members.mockImplementation(() => new Promise(() => undefined));
    view.rerender(<CompanyProvider><Probe /></CompanyProvider>);

    expect(context.companies).toEqual([]);
    expect(context.hasRole('DESIGNER')).toBe(false);
    expect(context.loading).toBe(true);
  });
});

describe('without memberships on the session (fallback to the directory)', () => {
  const refused = Object.assign(new Error('Forbidden'), { statusCode: 403 });

  it('reads the Account Manager\'s own row from the directory', async () => {
    members.mockResolvedValue([membership('A', ['ACCOUNT_MANAGER']), { ...membership('A', ['DESIGNER']), id: 'other', userId: 'someone-else' }]);
    mount();

    await waitFor(() => expect(context.hasRole('ACCOUNT_MANAGER')).toBe(true));
    // Somebody else's row never counts as mine.
    expect(context.hasRole('DESIGNER')).toBe(false);
  });

  it('fails closed, and says so, when the directory refuses the person', async () => {
    members.mockRejectedValue(refused);
    mount();

    await waitFor(() => expect(context.rolesUnavailable).toBe(true));
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(context.hasRole('DESIGNER')).toBe(false);
    expect(context.loading).toBe(false);
  });

  it('clears the notice once the directory can be read again', async () => {
    members.mockRejectedValueOnce(refused);
    mount();
    await waitFor(() => expect(context.rolesUnavailable).toBe(true));

    members.mockResolvedValue([membership('A', ['DESIGNER'])]);
    await act(async () => { await context.refreshMemberships(); });

    await waitFor(() => expect(context.rolesUnavailable).toBe(false));
    expect(context.hasRole('DESIGNER')).toBe(true);
  });

  it('ignores a slow answer for the client just left', async () => {
    const forA = deferred<Membership[]>();
    const forB = deferred<Membership[]>();
    members.mockImplementation((id: string) => (id === 'A' ? forA.promise : forB.promise));

    mount();
    await waitFor(() => expect(members).toHaveBeenCalledWith('A'));

    act(() => context.setActiveCompanyId('B'));

    // B answers first, then the stale answer for A arrives.
    await act(async () => { forB.resolve([membership('B', ['DESIGNER'])]); });
    await act(async () => { forA.resolve([membership('A', ['ACCOUNT_MANAGER'])]); });

    await waitFor(() => expect(context.activeCompanyId).toBe('B'));
    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });

  it('does not report the person as ready while their roles on the new client are still unknown', async () => {
    const forB = deferred<Membership[]>();
    members.mockImplementation((id: string) => (id === 'A' ? Promise.resolve([membership('A', ['ACCOUNT_MANAGER'])]) : forB.promise));

    mount();
    await waitFor(() => expect(context.hasRole('ACCOUNT_MANAGER')).toBe(true));

    act(() => context.setActiveCompanyId('B'));
    // A client-only person must not flash the agency app while the answer is in flight.
    expect(context.loading).toBe(true);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });
});
