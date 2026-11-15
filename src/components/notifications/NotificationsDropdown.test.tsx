// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AppNotification } from '@/types/domain';

const refreshNotifications = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/context/NotificationsContext', () => ({
  useNotifications: () => ({ unreadCount: 1, refreshUnreadCount: async () => {}, refreshNotifications }),
}));
vi.mock('./useOpenNotification', () => ({ useOpenNotification: () => async () => {} }));

const notification = {
  id: 'n1',
  type: 'TASK_ASSIGNED',
  title: 'New task for you',
  message: 'Revise launch carousel CTA',
  readAt: null,
  createdAt: '2026-10-27T10:00:00.000Z',
} as unknown as AppNotification;
const list = vi.hoisted(() => vi.fn());
vi.mock('@/services/notifications', () => ({
  notificationsService: { list: (...args: unknown[]) => list(...args), markAllRead: async () => {} },
}));

import { NotificationsDropdown } from './NotificationsDropdown';

function setup() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NotificationsDropdown />
        <button type="button">After</button>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const bell = () => screen.getByRole('button', { name: 'Notifications, 1 unread' });

beforeEach(() => {
  refreshNotifications.mockClear();
  list.mockReset().mockResolvedValue([notification]);
});
afterEach(cleanup);

describe('NotificationsDropdown', () => {
  it('is a disclosure, not a menu', async () => {
    const user = setup();
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
    expect(bell()).not.toHaveAttribute('aria-haspopup');
    await user.click(bell());
    const panel = screen.getByRole('region', { name: 'Recent notifications' });
    expect(bell()).toHaveAttribute('aria-expanded', 'true');
    expect(bell()).toHaveAttribute('aria-controls', panel.id);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves focus into the panel when it opens', async () => {
    const user = setup();
    await user.click(bell());
    await waitFor(() => expect(screen.getByRole('region', { name: 'Recent notifications' })).toHaveFocus());
    // Tab walks the panel's own controls, in order.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mark all read' })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to the bell', async () => {
    const user = setup();
    await user.click(bell());
    await waitFor(() => expect(screen.getByRole('region', { name: 'Recent notifications' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Recent notifications' })).not.toBeInTheDocument();
    expect(bell()).toHaveFocus();
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when focus tabs out of it', async () => {
    const user = setup();
    await user.click(bell());
    const viewAll = await screen.findByRole('button', { name: 'View all notifications' });
    viewAll.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Recent notifications' })).not.toBeInTheDocument();
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open while focus moves between its own controls', async () => {
    const user = setup();
    await user.click(bell());
    await screen.findByRole('button', { name: /New task for you/ });
    await user.tab();
    await user.tab();
    expect(screen.getByRole('region', { name: 'Recent notifications' })).toBeInTheDocument();
  });

  it('opening the bell asks for the latest notifications; closing it does not', async () => {
    const user = setup();
    await user.click(bell());
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
    await user.click(bell());
    expect(refreshNotifications).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh keeps the last list on screen instead of an error', async () => {
    const user = setup();
    await user.click(bell());
    await screen.findByRole('button', { name: /New task for you/ });
    // Mark all read refetches the list; this time the request fails.
    list.mockRejectedValue({ message: 'Network Error' });
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New task for you/ })).toBeInTheDocument();
  });
});
