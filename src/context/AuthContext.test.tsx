// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
