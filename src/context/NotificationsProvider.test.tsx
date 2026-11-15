// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NOTIFICATION_POLL_MS } from '@/hooks/useNotificationSync';
import { queryKeys } from '@/lib/queryClient';

/*
  The feed stays in step: the unread count and the list are refreshed by the
  same tick, so the badge never says something the dropdown does not show.
*/

const user = vi.hoisted(() => ({ current: { id: 'u1' } as { id: string } | null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: user.current }) }));

const service = vi.hoisted(() => ({
  unread: 0,
  unreadCount: vi.fn(),
  list: vi.fn(),
  getPreferences: vi.fn(async () => ({ mutedTypes: [], emailDigest: true })),
}));
vi.mock('@/services/notifications', () => ({
  notificationsService: {
    unreadCount: () => service.unreadCount(),
    list: () => service.list(),
    getPreferences: () => service.getPreferences(),
    updatePreferences: vi.fn(),
  },
}));

const { NotificationsProvider } = await import('./NotificationsProvider');
const { useNotifications } = await import('./NotificationsContext');

/** What the bell shows: the badge from the context, the list from the shared feed query. */
function Bell() {
  const { unreadCount } = useNotifications();
  const list = useQuery({ queryKey: queryKeys.notifications, queryFn: () => service.list() as Promise<Array<{ id: string }>> });
  return (
    <p>
      <span data-testid="badge">{unreadCount}</span>
      <span data-testid="items">{(list.data ?? []).length}</span>
    </p>
  );
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 45_000 } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationsProvider>
        <Bell />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  user.current = { id: 'u1' };
  service.unread = 1;
  service.unreadCount.mockReset().mockImplementation(async () => service.unread);
  service.list.mockReset().mockImplementation(async () => Array.from({ length: service.unread }, (_, i) => ({ id: `n${i}` })));
  service.getPreferences.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NotificationsProvider feed sync', () => {
  it('a new notification reaches the badge and the list on the same tick, without a reload', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('1'));

    service.unread = 2;
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS); });
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('2'));
    await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('2'));
    // One request each per tick: no duplicates.
    expect(service.unreadCount).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenCalledTimes(2);
    // The preferences share the key prefix but are not part of the feed.
    expect(service.getPreferences).toHaveBeenCalledTimes(1);
  });

  it('makes no notification request at all when signed out', async () => {
    user.current = null;
    setup();
    await act(async () => { vi.advanceTimersByTime(NOTIFICATION_POLL_MS * 3); });
    await flush();
    expect(service.unreadCount).not.toHaveBeenCalled();
    expect(service.getPreferences).not.toHaveBeenCalled();
  });
});
