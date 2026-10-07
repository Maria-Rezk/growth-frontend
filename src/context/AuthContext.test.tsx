// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

/*
  Pins the session-persistence contract this pass introduced:

  - the access token is never written to any browser storage — the httpOnly
    refresh cookie (simulated here by the fake network simply answering
    `POST /auth/refresh` from no prior state) is the only thing that decides
    whether a fresh app boot is signed in
  - no cookie / an expired one is the ordinary signed-out state, not an error
  - an explicit logout calls the server-side revoke and never throws even if
    that route doesn't exist yet
  - one tab's explicit sign-out is felt by another tab immediately

  Same no-mocking-library approach as httpRefresh.test.ts: a fake axios
  adapter stands in for the network, and `vi.resetModules()` + a fresh
  `import('./AuthContext')` per test isolates the module-level state in
  http.ts (the in-memory token, the handler singletons) between tests.
*/

type Route = (config: AxiosRequestConfig) => [number, unknown];

function fakeNetwork(routes: Record<string, Route>) {
  const calls: string[] = [];
  const adapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`;
    calls.push(key);
    const route = routes[key];
    if (!route) throw new Error(`No route for ${key}`);
    const [status, data] = route(config);
    const response: AxiosResponse = { status, statusText: String(status), data, headers: {}, config: config as AxiosResponse['config'] };
    if (status >= 400) {
      const error = new Error(`Request failed with status code ${status}`) as AxiosError;
      error.isAxiosError = true;
      error.response = response;
      error.config = config as AxiosError['config'];
      error.toJSON = () => ({});
      throw error;
    }
    return response;
  };
  return { adapter, calls };
}

async function boot(routes: Record<string, Route>) {
  vi.resetModules();
  const axios = (await import('axios')).default;
  const network = fakeNetwork(routes);
  axios.defaults.adapter = network.adapter;
  const mod = await import('./AuthContext');
  return { ...mod, ...network };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('session restore on boot', () => {
  it('signs a fresh page load in purely from the refresh cookie, storing the token nowhere', async () => {
    const { AuthProvider, useAuth } = await boot({
      'POST /auth/refresh': () => [200, { accessToken: 'fresh', user: { id: 'u1', email: 'a@b.com' } }],
      'GET /auth/me': () => [200, { id: 'u1', email: 'a@b.com' }],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('u1');
    expect(result.current.error).toBeNull();

    // The whole point: nothing about the session was ever written to
    // localStorage or sessionStorage, where any script on the page could
    // read it back.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('is the ordinary signed-out state, not an error, when there is no valid session cookie', async () => {
    const { AuthProvider, useAuth } = await boot({
      'POST /auth/refresh': () => [401, { message: 'no cookie' }],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('logout', () => {
  it('revokes the session server-side and broadcasts sign-out to other tabs', async () => {
    const { AuthProvider, useAuth, calls } = await boot({
      'POST /auth/refresh': () => [200, { accessToken: 'fresh', user: { id: 'u1', email: 'a@b.com' } }],
      'GET /auth/me': () => [200, { id: 'u1', email: 'a@b.com' }],
      'POST /auth/logout': () => [204, undefined],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    result.current.logout();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    await waitFor(() => expect(calls).toContain('POST /auth/logout'));
    // A signal that carries no secret — other tabs react to it themselves.
    expect(window.localStorage.getItem('growth.auth.broadcast')).toContain('signed-out');
  });

  it('still signs out locally even if the server has no logout route yet', async () => {
    const { AuthProvider, useAuth } = await boot({
      'POST /auth/refresh': () => [200, { accessToken: 'fresh', user: { id: 'u1', email: 'a@b.com' } }],
      'GET /auth/me': () => [200, { id: 'u1', email: 'a@b.com' }],
      // No route registered for POST /auth/logout — fakeNetwork throws, same
      // shape as a real route miss.
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(() => result.current.logout()).not.toThrow();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });
});

describe('cross-tab sync', () => {
  it('clears this tab when another tab broadcasts sign-out', async () => {
    const { AuthProvider, useAuth } = await boot({
      'POST /auth/refresh': () => [200, { accessToken: 'fresh', user: { id: 'u1', email: 'a@b.com' } }],
      'GET /auth/me': () => [200, { id: 'u1', email: 'a@b.com' }],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    // Simulate the storage event another tab's logout() would fire — this
    // tab never wrote the key itself, so the browser would deliver it.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'growth.auth.broadcast',
        newValue: JSON.stringify({ kind: 'signed-out', at: Date.now() }),
        storageArea: window.localStorage,
      }),
    );

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });

  it('re-establishes the session when another tab broadcasts sign-in', async () => {
    let refreshAttempts = 0;
    const { AuthProvider, useAuth } = await boot({
      'POST /auth/refresh': () => {
        refreshAttempts += 1;
        return refreshAttempts === 1
          ? [401, { message: 'no cookie yet' }]
          : [200, { accessToken: 'fresh', user: { id: 'u2', email: 'c@d.com' } }];
      },
      'GET /auth/me': () => [200, { id: 'u2', email: 'c@d.com' }],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'growth.auth.broadcast',
        newValue: JSON.stringify({ kind: 'signed-in', at: Date.now() }),
        storageArea: window.localStorage,
      }),
    );

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user?.id).toBe('u2');
  });
});

describe('cached server data belongs to one person', () => {
  const routes = {
    'POST /auth/refresh': () => [200, { accessToken: 't1', user: { id: 'u1', email: 'a@b.com' } }] as [number, unknown],
    // The session's own /auth/me: who it is depends on whose token is presented.
    'GET /auth/me': (config: AxiosRequestConfig) => (String((config.headers as Record<string, unknown> | undefined)?.Authorization ?? '').includes('t2')
      ? [200, { id: 'u2', email: 'c@d.com' }]
      : [200, { id: 'u1', email: 'a@b.com' }]) as [number, unknown],
    'POST /auth/login': () => [200, { accessToken: 't2', user: { id: 'u2', email: 'c@d.com' } }] as [number, unknown],
    'POST /auth/logout': () => [204, null] as [number, unknown],
  };
  const posts = ['companies', 'c1', 'posts'];

  it('is dropped when a different person signs in', async () => {
    const { AuthProvider, useAuth } = await boot(routes);
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    queryClient.setQueryData(posts, ['u1 private post']);
    await act(async () => { await result.current.login({ email: 'c@d.com', password: 'x'.repeat(12) }); });

    expect(result.current.user?.id).toBe('u2');
    expect(queryClient.getQueryData(posts)).toBeUndefined();
  });

  it('is dropped on logout', async () => {
    const { AuthProvider, useAuth } = await boot(routes);
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    queryClient.setQueryData(posts, ['u1 private post']);
    act(() => result.current.logout());

    expect(queryClient.getQueryData(posts)).toBeUndefined();
  });

  it('is kept when the same person is simply re-checked', async () => {
    const { AuthProvider, useAuth } = await boot(routes);
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    queryClient.setQueryData(posts, ['u1 post']);
    await act(async () => { await result.current.reloadUser({ silent: true }); });

    expect(result.current.user?.id).toBe('u1');
    expect(queryClient.getQueryData(posts)).toEqual(['u1 post']);
  });
});

describe('authentication stays separate from company roles', () => {
  const routes = {
    'POST /auth/refresh': () => [200, { accessToken: 't1', user: { id: 'u1', email: 'a@b.com' } }] as [number, unknown],
    'GET /auth/me': () => [200, { id: 'u1', email: 'a@b.com', platformRole: 'USER' }] as [number, unknown],
    'GET /boom': () => [403, { message: 'Forbidden' }] as [number, unknown],
  };
  const membershipsKey = ['me', 'memberships', 'u1'];

  it('is just the user: no membership field on it, and no membership request during boot', async () => {
    const { AuthProvider, useAuth, calls } = await boot(routes);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user).toEqual({ id: 'u1', email: 'a@b.com', platformRole: 'USER' });
    expect(result.current).not.toHaveProperty('sessionMemberships');
    expect(calls).toEqual(['POST /auth/refresh', 'GET /auth/me']);
  });

  it('reads /auth/me whether the user is bare or wrapped as { user }', async () => {
    const { AuthProvider, useAuth } = await boot({ ...routes, 'GET /auth/me': () => [200, { user: { id: 'u1', email: 'a@b.com' } }] });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user?.id).toBe('u1');
  });

  it('signs the person out, with an error, when /auth/me fails after a good refresh', async () => {
    const { AuthProvider, useAuth } = await boot({ ...routes, 'GET /auth/me': () => [500, { message: 'boom' }] });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it('drops the previous person\'s memberships from the cache when somebody else signs in', async () => {
    const { AuthProvider, useAuth } = await boot({
      ...routes,
      'POST /auth/login': () => [200, { accessToken: 't2', user: { id: 'u2', email: 'c@d.com' } }],
    });
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    queryClient.setQueryData(membershipsKey, [{ id: 'm1', companyId: 'A', roles: ['DESIGNER'], status: 'ACTIVE' }]);

    await act(async () => { await result.current.login({ email: 'c@d.com', password: 'x'.repeat(12) }); });

    expect(result.current.user?.id).toBe('u2');
    expect(queryClient.getQueryData(membershipsKey)).toBeUndefined();
  });

  it('drops the memberships from the cache on logout', async () => {
    const { AuthProvider, useAuth } = await boot({ ...routes, 'POST /auth/logout': () => [204, null] });
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    queryClient.setQueryData(membershipsKey, [{ id: 'm1', companyId: 'A', roles: ['DESIGNER'], status: 'ACTIVE' }]);

    act(() => result.current.logout());

    expect(queryClient.getQueryData(membershipsKey)).toBeUndefined();
  });

  it('keeps the memberships when the same person is simply re-checked', async () => {
    const { AuthProvider, useAuth } = await boot(routes);
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    queryClient.setQueryData(membershipsKey, [{ id: 'm1', companyId: 'A', roles: ['DESIGNER'], status: 'ACTIVE' }]);

    await act(async () => { await result.current.reloadUser({ silent: true }); });

    expect(queryClient.getQueryData(membershipsKey)).toHaveLength(1);
  });

  it('on a 403 re-reads the user and marks the memberships stale, without refreshing the token or replaying the request', async () => {
    const { AuthProvider, useAuth, calls } = await boot(routes);
    const { http } = await import('@/lib/http');
    const { queryClient } = await import('@/lib/queryClient');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    queryClient.setQueryData(membershipsKey, [{ id: 'm1', companyId: 'A', roles: ['DESIGNER'], status: 'ACTIVE' }]);
    const refreshesAtBoot = calls.filter((call) => call === 'POST /auth/refresh').length;
    const meAtBoot = calls.filter((call) => call === 'GET /auth/me').length;

    await expect(http.get('/boom')).rejects.toMatchObject({ statusCode: 403 });
    await expect(http.get('/boom')).rejects.toMatchObject({ statusCode: 403 });
    await waitFor(() => expect(calls.filter((call) => call === 'GET /auth/me').length).toBe(meAtBoot + 1));

    expect(queryClient.getQueryState(membershipsKey)?.isInvalidated).toBe(true);
    expect(calls.filter((call) => call === 'POST /auth/refresh').length).toBe(refreshesAtBoot);
    expect(calls.filter((call) => call === 'GET /boom').length).toBe(2);
  });
});
