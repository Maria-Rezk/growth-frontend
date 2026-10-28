const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

/** The live API. A dev build that reaches it — directly or through the Vite proxy — is flagged on screen. */
export const PRODUCTION_API_HOST = 'api.solu1ions.tech';

/** True when a `npm run dev` build would read and write production data. */
export function devTargetsProduction(
  isDev: boolean,
  apiBaseUrl: string | undefined,
  proxyTarget: string | undefined,
): boolean {
  if (!isDev) return false;
  return [apiBaseUrl, proxyTarget].some((value) => Boolean(value && value.includes(PRODUCTION_API_HOST)));
}

export const env = {
  apiBaseUrl: rawApiBaseUrl.replace(/\/$/, ''),
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  /*
    Arabic is translated for the navigation only; every page's copy is still
    English. Offering the toggle before the pages are translated hands a
    user a half-Arabic app, which reads as broken rather than in progress.
    Off until the page strings exist; flip it on per environment.
  */
  arabicEnabled: import.meta.env.VITE_ENABLE_ARABIC === 'true',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 25000),
  appName: import.meta.env.VITE_APP_NAME ?? 'Solu1ions — Business Development',
  devTargetsProduction: devTargetsProduction(
    import.meta.env.DEV,
    import.meta.env.VITE_API_BASE_URL,
    import.meta.env.VITE_DEV_PROXY_TARGET,
  ),
};

export function validateRuntimeEnv() {
  if (!env.apiBaseUrl) throw new Error('VITE_API_BASE_URL is required.');
  if (!Number.isFinite(env.apiTimeoutMs) || env.apiTimeoutMs < 1000) {
    throw new Error('VITE_API_TIMEOUT_MS must be a number greater than or equal to 1000.');
  }
}
