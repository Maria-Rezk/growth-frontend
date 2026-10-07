// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { Company, Membership } from '@/types/domain';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' }, sessionMemberships, reloadUser: async () => undefined }),
}));
vi.mock('@/services/companies', () => ({ companiesService: { list: async () => [], members: async () => [] } }));

const A = { id: 'A', name: 'Alpha' } as Company;
const B = { id: 'B', name: 'Beta' } as Company;
const mine = (company: Company): Membership =>
  ({ id: `m-${company.id}`, companyId: company.id, userId: 'u1', roles: ['ACCOUNT_MANAGER'], role: 'ACCOUNT_MANAGER', status: 'ACTIVE', company }) as Membership;
let sessionMemberships: Membership[] = [];

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

afterEach(cleanup);

describe('RequireCompany', () => {
  it('drops what a page was holding when the person switches client', async () => {
    window.localStorage.setItem('growth.activeCompanyId', 'A');
    sessionMemberships = [mine(A), mine(B)];
    render(
      <CompanyProvider>
        <Switcher />
        <RequireCompany>{(companyId) => <Page companyId={companyId} />}</RequireCompany>
      </CompanyProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('client').textContent).toBe('A'));
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'secret plan for Alpha' } });
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('secret plan for Alpha');

    act(() => switchTo('B'));

    // Same page, new client: Alpha's half-typed draft must not follow the person into Beta.
    expect(screen.getByTestId('client').textContent).toBe('B');
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');
  });
});
