// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Company, CompanyMembershipRole, PlatformRole, SessionMembership } from '@/types/domain';

type AuthState = { user: { id: string; platformRole: PlatformRole } | null };
let auth: AuthState;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const list = vi.fn();
const members = vi.fn();
vi.mock('@/services/companies', () => ({
  companiesService: { list: () => list(), members: (id: string) => members(id) },
}));

const mine = vi.fn();
vi.mock('@/services/memberships', () => ({ membershipsService: { mine: () => mine() } }));

import { CompanyProvider, useCompany } from './CompanyContext';

const ALL: Company[] = [
  { id: 'A', name: 'Alpha' } as Company,
  { id: 'B', name: 'Beta' } as Company,
  { id: 'C', name: 'Gamma' } as Company,
];

const membership = (companyId: string, roles: CompanyMembershipRole[], status: SessionMembership['status'] = 'ACTIVE'): SessionMembership =>
  ({ id: `m-${companyId}`, companyId, roles, status });

let context: ReturnType<typeof useCompany>;
function Probe() {
  context = useCompany();
  return null;
}

let client: QueryClient;
const wrap = (children: ReactNode) => <QueryClientProvider client={client}><CompanyProvider>{children}</CompanyProvider></QueryClientProvider>;
const mount = () => render(wrap(<Probe />));
const ready = () => waitFor(() => expect(context.loading).toBe(false));

/** A promise the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('growth.activeCompanyId', 'A');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  list.mockReset();
  members.mockReset();
  mine.mockReset();
  list.mockResolvedValue(ALL);
  mine.mockResolvedValue([]);
  auth = { user: { id: 'u1', platformRole: 'USER' } };
});

afterEach(cleanup);

describe('roles come from GET /me/memberships', () => {
  it('gives a person with one membership their roles on that client, and never reads the member directory', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    mount();
    await ready();

    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(context.rolesUnavailable).toBe(false);
    expect(members).not.toHaveBeenCalled();
  });

  it('REGRESSION: A = DESIGNER, B = SALES_AGENT. Switching to B never exposes the Designer role there', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER']), membership('B', ['SALES_AGENT'])]);
    mount();
    await ready();
    expect(context.activeCompanyId).toBe('A');
    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('SALES_AGENT')).toBe(false);

    act(() => context.setActiveCompanyId('B'));

    // The very render the switch lands in: B's roles, with nothing of A's left over.
    expect(context.activeCompanyId).toBe('B');
    expect(context.hasRole('SALES_AGENT')).toBe(true);
    expect(context.hasRole('DESIGNER')).toBe(false);
    expect(context.currentMembership?.companyId).toBe('B');

    act(() => context.setActiveCompanyId('A'));
    expect(context.hasRole('DESIGNER')).toBe(true);
    expect(context.hasRole('SALES_AGENT')).toBe(false);
  });

  it('is read once for every client: switching client does not request it again', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER']), membership('B', ['SALES_AGENT'])]);
    mount();
    await ready();

    act(() => context.setActiveCompanyId('B'));
    act(() => context.setActiveCompanyId('A'));

    expect(mine).toHaveBeenCalledTimes(1);
  });

  it('treats several roles on one membership as a union', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER', 'COPYWRITER'])]);
    mount();
    await ready();

    expect(context.hasRole('COPYWRITER')).toBe(true);
    expect(context.hasRole('DESIGNER', 'SALES_AGENT')).toBe(true);
    expect(context.hasRole('SALES_AGENT')).toBe(false);
  });

  it('gives no roles on a client the person has no membership for, rather than reusing another client\'s', async () => {
    mine.mockResolvedValue([membership('A', ['ACCOUNT_MANAGER'])]);
    mount();
    await ready();
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(true);

    act(() => context.setActiveCompanyId('B')); // B is listed but they hold nothing there

    expect(context.activeCompanyId).toBe('B');
    expect(context.currentMembership).toBeNull();
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });

  it('has no roles, and is not "unknown", for a person who belongs to nothing', async () => {
    mine.mockResolvedValue([]);
    list.mockResolvedValue([]);
    mount();
    await ready();

    expect(context.activeCompanyId).toBeNull();
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(context.rolesUnavailable).toBe(false);
  });

  it('ignores any membership that is not ACTIVE, even if one slips through', async () => {
    mine.mockResolvedValue([membership('A', ['ACCOUNT_MANAGER'], 'SUSPENDED'), membership('B', ['DESIGNER'], 'INVITED')]);
    mount();
    await ready();

    expect(context.memberships).toEqual([]);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
  });

  it('is not "ready" while the roles are still on the way, so a client-only person never flashes the agency app', async () => {
    const pending = deferred<SessionMembership[]>();
    mine.mockReturnValue(pending.promise);
    mount();

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(context.loading).toBe(true);

    await act(async () => { pending.resolve([membership('A', ['CLIENT_REVIEWER'])]); });
    await ready();
    expect(context.hasRole('CLIENT_REVIEWER')).toBe(true);
  });
});

describe('when /me/memberships cannot be read', () => {
  const failure = Object.assign(new Error('Server error'), { statusCode: 500 });

  it('fails closed and says the roles are unknown, instead of guessing or asking the directory', async () => {
    mine.mockRejectedValue(failure);
    mount();

    await waitFor(() => expect(context.rolesUnavailable).toBe(true));
    expect(context.loading).toBe(false);
    expect(context.hasRole('ACCOUNT_MANAGER')).toBe(false);
    expect(context.hasRole('DESIGNER')).toBe(false);
    expect(members).not.toHaveBeenCalled();
  });

  it('clears the notice when the person retries and it works', async () => {
    mine.mockRejectedValueOnce(failure);
    mount();
    await waitFor(() => expect(context.rolesUnavailable).toBe(true));

    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    await act(async () => { await context.refreshMemberships(); });

    await waitFor(() => expect(context.rolesUnavailable).toBe(false));
    expect(context.hasRole('DESIGNER')).toBe(true);
  });

  it('does not treat a body that is not a membership list as an empty one', async () => {
    mine.mockRejectedValue(new Error('Unexpected response from the memberships endpoint.'));
    mount();

    await waitFor(() => expect(context.rolesUnavailable).toBe(true));
  });
});

describe('platform admins', () => {
  it('see every client with no membership, pass without roles, and are not flagged as unknown', async () => {
    auth.user = { id: 'admin', platformRole: 'AGENCY_ADMIN' };
    mine.mockResolvedValue([]);
    mount();
    await ready();

    expect(context.companies.map((company) => company.id)).toEqual(['A', 'B', 'C']);
    expect(context.currentMembership).toBeNull();
    expect(context.memberships).toEqual([]);
    expect(context.rolesUnavailable).toBe(false);
    expect(members).not.toHaveBeenCalled();
  });

  it('are not locked out, nor flagged, if their membership read fails', async () => {
    auth.user = { id: 'admin', platformRole: 'SUPER_ADMIN' };
    mine.mockRejectedValue(new Error('down'));
    mount();
    await ready();

    expect(context.companies).toHaveLength(3);
    expect(context.rolesUnavailable).toBe(false);
  });
});

describe('the client list is GET /companies', () => {
  it('is read for a normal user too', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    list.mockResolvedValue([ALL[0]]);
    mount();
    await ready();

    expect(list).toHaveBeenCalledTimes(1);
    expect(context.companies.map((company) => company.id)).toEqual(['A']);
  });

  it('is sorted by name', async () => {
    auth.user = { id: 'admin', platformRole: 'SUPER_ADMIN' };
    list.mockResolvedValue([ALL[2], ALL[0], ALL[1]]);
    mount();
    await ready();

    expect(context.companies.map((company) => company.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('falls to the first reachable client when the stored one is no longer listed', async () => {
    mine.mockResolvedValue([membership('B', ['DESIGNER'])]);
    list.mockResolvedValue([ALL[1]]);
    window.localStorage.setItem('growth.activeCompanyId', 'A');
    mount();
    await ready();

    expect(context.activeCompanyId).toBe('B');
  });

  it('reports a list that could not be loaded as an error, not as an empty workspace', async () => {
    list.mockRejectedValue(new Error('Could not reach the server'));
    mount();

    await waitFor(() => expect(context.error).toBe('Could not reach the server'));
    expect(context.companies).toEqual([]);
  });

  it('is not refetched when only the person\'s roles change', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    mount();
    await ready();
    expect(list).toHaveBeenCalledTimes(1);

    mine.mockResolvedValue([membership('A', ['DESIGNER', 'COPYWRITER'])]);
    await act(async () => { await context.refreshMemberships(); });

    await waitFor(() => expect(context.hasRole('COPYWRITER')).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('is refetched when the person gains a client', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    mount();
    await ready();

    mine.mockResolvedValue([membership('A', ['DESIGNER']), membership('B', ['SALES_AGENT'])]);
    await act(async () => { await context.refreshMemberships(); });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});

describe('one person\'s data is never shown to the next', () => {
  it('drops the previous person\'s clients and roles the moment the identity changes', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    const view = mount();
    await waitFor(() => expect(context.hasRole('DESIGNER')).toBe(true));
    expect(context.companies).toHaveLength(3);

    // Somebody else's session takes over this tab; neither their clients nor their roles have arrived.
    list.mockImplementation(() => new Promise(() => undefined));
    mine.mockImplementation(() => new Promise(() => undefined));
    auth = { user: { id: 'u2', platformRole: 'USER' } };
    view.rerender(wrap(<Probe />));

    expect(context.companies).toEqual([]);
    expect(context.loading).toBe(true);
    expect(context.memberships).toEqual([]);
    expect(context.hasRole('DESIGNER')).toBe(false);
  });

  it('keeps each person\'s memberships under their own cache entry', async () => {
    mine.mockResolvedValue([membership('A', ['DESIGNER'])]);
    const view = mount();
    await waitFor(() => expect(context.hasRole('DESIGNER')).toBe(true));

    mine.mockResolvedValue([membership('A', ['SALES_AGENT'])]);
    auth = { user: { id: 'u2', platformRole: 'USER' } };
    view.rerender(wrap(<Probe />));
    await waitFor(() => expect(context.hasRole('SALES_AGENT')).toBe(true));

    expect(context.hasRole('DESIGNER')).toBe(false);
    expect(client.getQueryData(['me', 'memberships', 'u1'])).toEqual([membership('A', ['DESIGNER'])]);
    expect(client.getQueryData(['me', 'memberships', 'u2'])).toEqual([membership('A', ['SALES_AGENT'])]);
  });
});
