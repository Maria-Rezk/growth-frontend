// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { Company, SessionMembership } from '@/types/domain';

let platformRole = 'USER';
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole } }),
}));

const A = { id: 'A', name: 'Alpha' } as Company;
const B = { id: 'B', name: 'Beta' } as Company;
vi.mock('@/services/companies', () => ({ companiesService: { list: async () => [A, B], members: async () => [] } }));

const held = (company: Company): SessionMembership => ({ id: `m-${company.id}`, companyId: company.id, roles: ['ACCOUNT_MANAGER'], status: 'ACTIVE' });
let myMemberships: SessionMembership[] | Error = [];
vi.mock('@/services/memberships', () => ({
  membershipsService: {
    mine: async () => {
      if (myMemberships instanceof Error) throw myMemberships;
      return myMemberships;
    },
  },
}));

import { CompanyProvider, useCompany } from '@/context/CompanyContext';
import { RequireCompany } from './RequireCompany';

/** A page with state of its own: a draft the person has half typed for ONE client. */
function Page({ companyId }: { companyId: string }) {
  const [draft, setDraft] = useState('');
  return (
    <>
      <span data-testid="client">{companyId}</span>
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </>
  );
}

let switchTo: (id: string) => void;
function Switcher() {
  switchTo = useCompany().setActiveCompanyId;
  return null;
}

const page = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CompanyProvider>
      <Switcher />
      <RequireCompany>{(companyId) => <Page companyId={companyId} />}</RequireCompany>
    </CompanyProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  window.localStorage.setItem('growth.activeCompanyId', 'A');
  myMemberships = [];
});

afterEach(() => {
  cleanup();
  platformRole = 'USER';
});

describe('RequireCompany', () => {
  it('says the roles are unknown, with a retry, when the memberships could not be read', async () => {
    myMemberships = new Error('down');
    render(page());

    await waitFor(() => expect(screen.getByText(/could not confirm your role/i)).not.toBeNull());
    expect(screen.getByRole('button', { name: /try again/i })).not.toBeNull();
  });

  it('does not say so to a platform admin, who needs no role', async () => {
    myMemberships = new Error('down');
    platformRole = 'SUPER_ADMIN';
    render(page());

    await waitFor(() => expect(screen.getByTestId('client').textContent).toBe('A'));
    expect(screen.queryByText(/could not confirm your role/i)).toBeNull();
  });

  it('says nothing when the memberships were read and are simply empty', async () => {
    myMemberships = [];
    render(page());

    await waitFor(() => expect(screen.getByTestId('client').textContent).toBe('A'));
    expect(screen.queryByText(/could not confirm your role/i)).toBeNull();
  });

  it('drops what a page was holding when the person switches client', async () => {
    myMemberships = [held(A), held(B)];
    render(page());

    await waitFor(() => expect(screen.getByTestId('client').textContent).toBe('A'));
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'secret plan for Alpha' } });
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('secret plan for Alpha');

    act(() => switchTo('B'));

    // Same page, new client: Alpha's half-typed draft must not follow the person into Beta.
    expect(screen.getByTestId('client').textContent).toBe('B');
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');
  });
});
