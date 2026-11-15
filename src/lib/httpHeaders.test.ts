// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

/*
  Which headers each request carries, per environment. The ngrok bypass header
  goes only to an ngrok tunnel; a normal API host never sees it. The auth and
  content-type headers are the same everywhere.
*/

type Seen = Record<string, unknown>;

async function boot(apiBaseUrl: string, { dev = false, proxyTarget = '' } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);
  vi.stubEnv('VITE_DEV_PROXY_TARGET', proxyTarget);
  vi.stubEnv('DEV', dev);
  const axios = (await import('axios')).default;
  const seen: Seen[] = [];
  axios.defaults.adapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    const headers = config.headers as { toJSON?: () => Seen } | Seen | undefined;
    seen.push(typeof headers?.toJSON === 'function' ? headers.toJSON() : { ...(headers as Seen) });
    const data = config.url === '/auth/refresh' ? { accessToken: 'fresh' } : { data: 'ok' };
    return { status: 200, statusText: 'OK', data, headers: {}, config: config as AxiosResponse['config'] };
  };
  const mod = await import('./http');
  return { ...mod, seen };
}

const NGROK = 'ngrok-skip-browser-warning';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('request headers', () => {
  it('sends no ngrok header to the production API, and keeps auth and content type', async () => {
    const { http, tokenStorage, refreshSession, seen } = await boot('https://api.solu1ions.tech/api');
    tokenStorage.set('access-1');
    await http.get('/tasks');
    await http.post('/tasks', { title: 'x' });
    await refreshSession();

    expect(seen).toHaveLength(3);
    seen.forEach((headers) => expect(headers).not.toHaveProperty(NGROK));
    expect(seen[0]).toMatchObject({ Authorization: 'Bearer access-1' });
    expect(seen[1]).toMatchObject({ Authorization: 'Bearer access-1', 'Content-Type': 'application/json' });
    // The refresh call carries the cookie, never the expired bearer token.
    expect(seen[2]).not.toHaveProperty('Authorization');
  });

  it('sends no ngrok header to a local or staging API', async () => {
    for (const base of ['http://localhost:3000/api', 'https://staging-api.example.com/api']) {
      const { http, seen } = await boot(base, { dev: true });
      await http.get('/tasks');
      expect(seen[0]).not.toHaveProperty(NGROK);
    }
  });

  it('sends the ngrok header, on every client, when the API is an ngrok tunnel', async () => {
    const { http, tokenStorage, refreshSession, seen } = await boot('https://abc123.ngrok-free.app/api');
    tokenStorage.set('access-1');
    await http.get('/tasks');
    await refreshSession();

    expect(seen[0]).toMatchObject({ [NGROK]: 'true', Authorization: 'Bearer access-1' });
    expect(seen[1]).toMatchObject({ [NGROK]: 'true' });
  });

  it('sends the ngrok header in dev when the Vite proxy forwards to an ngrok tunnel', async () => {
    const { http, seen } = await boot('/api', { dev: true, proxyTarget: 'https://abc123.ngrok.app' });
    await http.get('/tasks');
    expect(seen[0]).toMatchObject({ [NGROK]: 'true' });
  });

  it('ignores a proxy target outside dev, where Vite does not proxy', async () => {
    const { http, seen } = await boot('/api', { dev: false, proxyTarget: 'https://abc123.ngrok.app' });
    await http.get('/tasks');
    expect(seen[0]).not.toHaveProperty(NGROK);
  });
});
