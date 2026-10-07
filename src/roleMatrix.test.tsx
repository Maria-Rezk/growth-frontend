// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Company, CompanyMembershipRole, Membership, PlatformRole } from '@/types/domain';

/*
  The role matrix, end to end through the real chain:

    session memberships -> CompanyProvider -> active client -> roles
      -> permission helper -> Sidebar / RoleGate / client view

  Only the network edge is faked: AuthContext hands over the session, the
  companies service answers for admins. Everything between (the context that
  derives roles, `useCan`, `useClientView`, the Sidebar's gating) is real, so
  a change to who-may-see-what shows up here as a visible diff.

  This is automated permission testing. It is not backend integration testing:
  it proves what the UI offers each role, not what the API will accept.
*/

type AuthState = {
  user: { id: string; platformRole: PlatformRole } | null;
  sessionMemberships: Membership[] | null;
  reloadUser: () => Promise<void>;
};
let auth: AuthState;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/context/NotificationsContext', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/context/LocaleContext', () => ({ useLocale: () => ({ t: (key: string) => key }) }));

const everyClient: Company[] = [{ id: 'A', name: 'Alpha' } as Company, { id: 'B', name: 'Beta' } as Company];
vi.mock('@/services/companies', () => ({
  companiesService: { list: async () => everyClient, members: async () => [] },
}));

import { CompanyProvider, useCompany } from '@/context/CompanyContext';
import { RoleGate } from '@/components/domain/RoleGate';
import { Sidebar } from '@/components/layout/Sidebar';
import { useCan } from '@/hooks/usePermission';
import { useClientView } from '@/hooks/useClientView';
import type { Permission } from '@/utils/permissions';

const company = (id: string) => everyClient.find((item) => item.id === id) as Company;
const member = (companyId: string, roles: CompanyMembershipRole[], status: Membership['status'] = 'ACTIVE'): Membership =>
  ({ id: `m-${companyId}`, companyId, userId: 'u1', roles, role: roles[0], status, company: company(companyId) }) as Membership;

let companyApi: ReturnType<typeof useCompany>;
let can: ReturnType<typeof useCan>;
let clientView: ReturnType<typeof useClientView>;
function Probe() {
  companyApi = useCompany();
  can = useCan();
  clientView = useClientView();
  return null;
}

const AGENCY = ['/my-work', '/dashboard', '/brand-profile', '/content-plans', '/posts', '/campaigns', '/tasks', '/approvals', '/responsibilities', '/notifications'];
const ADMIN_GROUP = ['/admin/dashboard', '/admin/employees', '/admin/clients'];
const AM_ONLY = ['/ai-studio', '/leads', '/automations', '/reports', '/members'];

/** Every link the Sidebar shows. */
function sidebarLinks(): string[] {
  return [...document.querySelectorAll('.sidebar__nav a')].map((anchor) => anchor.getAttribute('href') ?? '');
}

async function renderFor(user: AuthState['user'], memberships: Membership[] | null, extra: ReactNode = null) {
  auth = { user, sessionMemberships: memberships, reloadUser: async () => undefined };
  const view = render(
    <MemoryRouter>
      <CompanyProvider>
        <Probe />
        <Sidebar open={false} onClose={() => undefined} />
        {extra}
      </CompanyProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(companyApi.loading).toBe(false));
  return view;
}

const asUser = (roles: CompanyMembershipRole[], status: Membership['status'] = 'ACTIVE', extra: ReactNode = null) =>
  renderFor({ id: 'u1', platformRole: 'USER' }, [member('A', roles, status)], extra);

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('growth.activeCompanyId', 'A');
});
afterEach(cleanup);

describe('navigation, by role', () => {
  const cases: Array<[string, CompanyMembershipRole[], string[]]> = [
    ['ACCOUNT_MANAGER', ['ACCOUNT_MANAGER'], [...AGENCY, ...AM_ONLY]],
    ['SOCIAL_MEDIA_MANAGER', ['SOCIAL_MEDIA_MANAGER'], [...AGENCY, '/ai-studio']],
    ['COPYWRITER', ['COPYWRITER'], [...AGENCY, '/ai-studio']],
    ['DESIGNER', ['DESIGNER'], [...AGENCY]],
    ['SALES_AGENT', ['SALES_AGENT'], [...AGENCY, '/leads']],
    ['a Designer who is also a Copywriter', ['DESIGNER', 'COPYWRITER'], [...AGENCY, '/ai-studio']],
    ['a Designer who is also the Account Manager', ['DESIGNER', 'ACCOUNT_MANAGER'], [...AGENCY, ...AM_ONLY]],
  ];

  it.each(cases)('%s sees exactly their agency navigation', async (_name, roles, expected) => {
    await asUser(roles);
    expect([...sidebarLinks()].sort()).toEqual([...expected].sort());
    expect(clientView.isClient).toBe(false);
  });

  it('CLIENT_OWNER gets the client portal, with the live overview', async () => {
    await asUser(['CLIENT_OWNER']);
    expect([...sidebarLinks()].sort()).toEqual(['/brand-profile', '/content-plans', '/home', '/notifications', '/posts', '/reports'].sort());
    expect(clientView.isClient).toBe(true);
  });

  it('CLIENT_REVIEWER gets the client portal without reports', async () => {
    await asUser(['CLIENT_REVIEWER']);
    expect([...sidebarLinks()].sort()).toEqual(['/brand-profile', '/content-plans', '/home', '/notifications', '/posts'].sort());
    expect(clientView.isClient).toBe(true);
  });

  it.each(['SUPER_ADMIN', 'AGENCY_ADMIN'] as const)('%s sees everything, with no membership at all', async (platformRole) => {
    await renderFor({ id: 'u1', platformRole }, []);
    expect([...sidebarLinks()].sort()).toEqual([...AGENCY, ...AM_ONLY, ...ADMIN_GROUP].sort());
    expect(clientView.isClient).toBe(false);
    expect(companyApi.companies.map((item) => item.id)).toEqual(['A', 'B']);
  });

  it('an ordinary USER with no membership gets no client, and nothing gated', async () => {
    await renderFor({ id: 'u1', platformRole: 'USER' }, []);
    expect(companyApi.companies).toEqual([]);
    expect(companyApi.activeCompanyId).toBeNull();
    AM_ONLY.forEach((href) => expect(sidebarLinks()).not.toContain(href));
    expect(sidebarLinks().some((href) => href.startsWith('/admin'))).toBe(false);
  });

  it('a SUSPENDED Account Manager has no client and no controls', async () => {
    await asUser(['ACCOUNT_MANAGER'], 'SUSPENDED');
    expect(companyApi.companies).toEqual([]);
    expect(can('automations:manage')).toBe(false);
    expect(sidebarLinks()).not.toContain('/automations');
  });
});

describe('different roles on different clients', () => {
  it('re-derive navigation and permissions the instant the client changes', async () => {
    await renderFor({ id: 'u1', platformRole: 'USER' }, [member('A', ['ACCOUNT_MANAGER']), member('B', ['CLIENT_REVIEWER'])]);
    expect(sidebarLinks()).toContain('/automations');
    expect(can('automations:manage')).toBe(true);
    expect(clientView.isClient).toBe(false);

    act(() => companyApi.setActiveCompanyId('B'));

    // The very render the switch lands in: nothing of client A's authority is left over.
    expect(companyApi.activeCompanyId).toBe('B');
    expect(can('automations:manage')).toBe(false);
    expect(can('posts:approve')).toBe(true);
    expect(clientView.isClient).toBe(true);
    expect(sidebarLinks()).toContain('/home');
    expect(sidebarLinks()).not.toContain('/automations');
  });
});

describe('what each role may do on the active client', () => {
  const grants: Array<[string, CompanyMembershipRole[], Permission[], Permission[]]> = [
    ['ACCOUNT_MANAGER', ['ACCOUNT_MANAGER'], ['posts:create', 'posts:publish', 'posts:approve', 'tasks:edit', 'campaigns:manage', 'members:manage', 'reports:generate', 'reports:share', 'automations:manage', 'brand:edit', 'responsibilities:manage'], []],
    ['SOCIAL_MEDIA_MANAGER', ['SOCIAL_MEDIA_MANAGER'], ['posts:create', 'posts:publish', 'tasks:edit', 'campaigns:manage', 'plans:manage', 'ai:generate'], ['posts:approve', 'members:manage', 'automations:manage', 'reports:list', 'leads:manage', 'brand:edit']],
    ['COPYWRITER', ['COPYWRITER'], ['tasks:manage', 'ai:generate'], ['posts:create', 'posts:edit', 'posts:submit', 'tasks:edit', 'campaigns:manage', 'leads:manage']],
    ['DESIGNER', ['DESIGNER'], ['postAssets:manage', 'tasks:manage'], ['posts:create', 'ai:generate', 'leads:manage', 'reports:view']],
    ['SALES_AGENT', ['SALES_AGENT'], ['leads:manage', 'tasks:manage'], ['posts:create', 'tasks:edit', 'ai:generate', 'reports:view']],
    ['CLIENT_OWNER', ['CLIENT_OWNER'], ['posts:approve', 'reports:view'], ['posts:create', 'tasks:manage', 'reports:list', 'reports:generate', 'posts:history', 'leads:manage']],
    ['CLIENT_REVIEWER', ['CLIENT_REVIEWER'], ['posts:approve'], ['reports:view', 'reports:list', 'tasks:manage', 'posts:history', 'leads:manage', 'brand:edit']],
  ];

  it.each(grants)('%s', async (_name, roles, allowed, denied) => {
    await asUser(roles);
    allowed.forEach((permission) => expect(can(permission), `should allow ${permission}`).toBe(true));
    denied.forEach((permission) => expect(can(permission), `should deny ${permission}`).toBe(false));
  });

  it('both admins pass every check without belonging to the client', async () => {
    await renderFor({ id: 'u1', platformRole: 'AGENCY_ADMIN' }, []);
    (['posts:create', 'automations:manage', 'reports:generate', 'members:manage', 'ai:generate'] as Permission[]).forEach((permission) => expect(can(permission)).toBe(true));
  });

  it('RoleGate renders its children only for a role that may', async () => {
    const view = await asUser(['DESIGNER'], 'ACTIVE', (
      <>
        <RoleGate permission="postAssets:manage" fallback={<span>no</span>}><span>assets</span></RoleGate>
        <RoleGate permission="automations:manage" fallback={<span>denied</span>}><span>rules</span></RoleGate>
      </>
    ));
    expect(view.queryByText('assets')).not.toBeNull();
    expect(view.queryByText('rules')).toBeNull();
    expect(view.queryByText('denied')).not.toBeNull();
  });
});
