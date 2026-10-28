// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { messages } from '@/i18n/messages';

let platformRole = 'USER';
let view = { isClient: false, ready: true, hasCompany: true };

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', platformRole } }) }));
vi.mock('@/context/CompanyContext', () => ({ useCompany: () => ({ error: null, refreshCompanies: async () => {} }) }));
vi.mock('@/context/NotificationsContext', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/context/LocaleContext', () => ({ useLocale: () => ({ t: (key: string) => messages.en[key] ?? key, lang: 'en' }) }));
vi.mock('@/hooks/useClientView', () => ({ useClientView: () => view }));
vi.mock('@/hooks/usePermission', () => ({ useCan: () => () => true }));

import { Sidebar } from './Sidebar';
import { LandingRedirect } from './AgencyRoute';

/** The sidebar on some page, with the real landing route behind "/". */
function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar open={false} onClose={() => {}} />
      <Routes>
        <Route index element={<LandingRedirect />} />
        <Route path="/tasks" element={<h1>Tasks</h1>} />
        <Route path="/posts" element={<h1>Content posts</h1>} />
        <Route path="/my-work" element={<h1>My work</h1>} />
        <Route path="/home" element={<h1>Client home</h1>} />
        <Route path="/dashboard" element={<h1>Client overview</h1>} />
        <Route path="/admin/dashboard" element={<h1>Operations</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const logo = () => screen.getByRole('link', { name: 'Solu1ions — go to your home page' });

beforeEach(() => {
  platformRole = 'USER';
  view = { isClient: false, ready: true, hasCompany: true };
});

afterEach(cleanup);

describe('Sidebar logo', () => {
  it('links to the role-aware home, not a hard-coded page', () => {
    at('/tasks');
    expect(logo()).toHaveAttribute('href', '/');
  });

  it('takes staff to My work (it used to open Client overview)', async () => {
    at('/tasks');
    await userEvent.setup().click(logo());
    expect(await screen.findByRole('heading', { name: 'My work' })).toBeInTheDocument();
  });

  it('takes a client to their Home', async () => {
    view = { isClient: true, ready: true, hasCompany: true };
    at('/posts');
    await userEvent.setup().click(logo());
    expect(await screen.findByRole('heading', { name: 'Client home' })).toBeInTheDocument();
  });

  it('takes a platform admin with no client to Operations', async () => {
    platformRole = 'SUPER_ADMIN';
    view = { isClient: false, ready: true, hasCompany: false };
    at('/tasks');
    await userEvent.setup().click(logo());
    expect(await screen.findByRole('heading', { name: 'Operations' })).toBeInTheDocument();
  });

  it('takes a platform admin who works on a client to My work, like other staff', async () => {
    platformRole = 'SUPER_ADMIN';
    at('/tasks');
    await userEvent.setup().click(logo());
    expect(await screen.findByRole('heading', { name: 'My work' })).toBeInTheDocument();
  });
});
