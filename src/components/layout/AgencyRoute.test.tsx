// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

let platformRole = 'USER';
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole } }),
}));

let companyError: string | null = null;
vi.mock('@/context/CompanyContext', () => ({
  useCompany: () => ({ error: companyError, refreshCompanies: async () => {} }),
}));

let view = { isClient: false, ready: true, hasCompany: true };
vi.mock('@/hooks/useClientView', () => ({ useClientView: () => view }));

import { AgencyRoute, LandingRedirect } from './AgencyRoute';

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route index element={<LandingRedirect />} />
        <Route element={<AgencyRoute />}>
          <Route path="/leads" element={<h1>Leads page</h1>} />
        </Route>
        <Route path="/home" element={<h1>Client home</h1>} />
        <Route path="/my-work" element={<h1>My work</h1>} />
        <Route path="/admin/dashboard" element={<h1>Operations</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  platformRole = 'USER';
  companyError = null;
  view = { isClient: false, ready: true, hasCompany: true };
});

afterEach(cleanup);

describe('AgencyRoute', () => {
  it('does not mount the agency page while the roles are still loading', () => {
    view = { isClient: false, ready: false, hasCompany: false };
    at('/leads');
    expect(screen.queryByText('Leads page')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading clients…');
  });

  it('sends a client to their Home', () => {
    view = { isClient: true, ready: true, hasCompany: true };
    at('/leads');
    expect(screen.getByText('Client home')).toBeInTheDocument();
  });

  it('shows the page to staff', () => {
    at('/leads');
    expect(screen.getByText('Leads page')).toBeInTheDocument();
  });
});

describe('LandingRedirect', () => {
  it('sends staff to My work and clients Home', () => {
    at('/');
    expect(screen.getByText('My work')).toBeInTheDocument();
    cleanup();
    view = { isClient: true, ready: true, hasCompany: true };
    at('/');
    expect(screen.getByText('Client home')).toBeInTheDocument();
  });

  it('explains instead of rendering nothing when the person has no client', () => {
    view = { isClient: false, ready: true, hasCompany: false };
    at('/');
    expect(screen.getByText('No client assigned yet')).toBeInTheDocument();
  });

  it('shows the load error, not "no client", when the client list failed', () => {
    view = { isClient: false, ready: true, hasCompany: false };
    companyError = 'Could not load clients.';
    at('/');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load clients.');
  });

  it('sends a platform admin with no client to the operations dashboard', () => {
    platformRole = 'SUPER_ADMIN';
    view = { isClient: false, ready: true, hasCompany: false };
    at('/');
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });
});
