// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

/*
  The refresh interceptor is the one piece of the HTTP layer a user feels:
  get it wrong and every expired access token is a trip back to the login
  screen. These tests pin the contract in `http.ts`:

  - a 401 refreshes once and retries the original request
  - a second 401, or a failed refresh, signs the user out
  - concurrent 401s share one refresh call
  - the login endpoint never triggers a refresh

  No mocking library: axios lets an adapter stand in for the network, and
  every client created after `axios.defaults.adapter` is set inherits it —
  including the private refresh client inside `http.ts`.
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
  const mod = await import('./http');
  return { ...mod, ...network };
}

const authHeader = (config: AxiosRequestConfig) => String((config.headers as Record<string, unknown> | undefined)?.Authorization ?? '');

describe('401 → refresh → retry', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('refreshes once and replays the request with the new token', async () => {
    const { http, tokenStorage, setUnauthorizedHandler, calls } = await boot({
      'GET /tasks': (config) => (authHeader(config) === 'Bearer fresh' ? [200, { data: ['ok'] }] : [401, { message: 'expired' }]),
      'POST /auth/refresh': () => [200, { accessToken: 'fresh' }],
    });
    tokenStorage.set('expired');
    const signedOut = vi.fn();
    setUnauthorizedHandler(signedOut);

    const response = await http.get('/tasks');

    expect(response.status).toBe(200);
    expect(calls).toEqual(['GET /tasks', 'POST /auth/refresh', 'GET /tasks']);
    expect(tokenStorage.get()).toBe('fresh');
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('signs out when the retried request is refused again', async () => {
    const { http, tokenStorage, setUnauthorizedHandler, calls } = await boot({
      'GET /tasks': () => [401, { message: 'expired' }],
      'POST /auth/refresh': () => [200, { accessToken: 'fresh' }],
    });
    tokenStorage.set('expired');
    const signedOut = vi.fn();
    setUnauthorizedHandler(signedOut);

    await expect(http.get('/tasks')).rejects.toMatchObject({ statusCode: 401 });
    // Exactly one refresh, one retry — never a loop.
    expect(calls).toEqual(['GET /tasks', 'POST /auth/refresh', 'GET /tasks']);
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(tokenStorage.get()).toBeNull();
  });

  it('signs out when the refresh itself fails', async () => {
    const { http, tokenStorage, setUnauthorizedHandler, calls } = await boot({
      'GET /tasks': () => [401, { message: 'expired' }],
      'POST /auth/refresh': () => [401, { message: 'no cookie' }],
    });
    tokenStorage.set('expired');
    const signedOut = vi.fn();
    setUnauthorizedHandler(signedOut);

    await expect(http.get('/tasks')).rejects.toMatchObject({ statusCode: 401 });
    expect(calls).toEqual(['GET /tasks', 'POST /auth/refresh']);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    const reply: Route = (config) => (authHeader(config) === 'Bearer fresh' ? [200, { data: [] }] : [401, {}]);
    const { http, tokenStorage, calls } = await boot({
      'GET /a': reply,
      'GET /b': reply,
      'GET /c': reply,
      'POST /auth/refresh': () => [200, { accessToken: 'fresh' }],
    });
    tokenStorage.set('expired');

    await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    expect(calls.filter((call) => call === 'POST /auth/refresh')).toHaveLength(1);
  });

  it('never refreshes on a rejected login', async () => {
    const { http, calls } = await boot({
      'POST /auth/login': () => [401, { message: 'Invalid credentials' }],
      'POST /auth/refresh': () => [200, { accessToken: 'fresh' }],
    });

    await expect(http.post('/auth/login', {})).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    expect(calls).toEqual(['POST /auth/login']);
  });

  it('hands a 403 to the forbidden handler with the path that produced it', async () => {
    const { http, setForbiddenHandler } = await boot({
      'DELETE /companies/1': () => [403, { message: 'Forbidden' }],
    });
    const forbidden = vi.fn();
    setForbiddenHandler(forbidden);

    await expect(http.delete('/companies/1')).rejects.toMatchObject({ statusCode: 403 });
    expect(forbidden).toHaveBeenCalledWith('/companies/1');
  });
});
