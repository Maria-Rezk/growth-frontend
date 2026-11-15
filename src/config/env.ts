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

/** ngrok's tunnel domains (current and legacy). */
const NGROK_HOST = /(^|\.)ngrok(-free)?\.(app|dev|io)$/i;

/** True when `value` (absolute, or relative to this page) is an ngrok tunnel URL. */
export function isNgrokUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return NGROK_HOST.test(new URL(value, 'http://localhost').hostname);
  } catch {
    return false;
  }
}

/**
 * Does this build talk to an ngrok tunnel, directly or (dev only) through the
 * Vite proxy? Only then is `ngrok-skip-browser-warning` sent — ngrok answers a
 * browser-like request without it with an HTML interstitial instead of the
 * API. Any other host never sees the header.
 */
export function needsNgrokBypass(isDev: boolean, apiBaseUrl: string | undefined, proxyTarget: string | undefined): boolean {
  return isNgrokUrl(apiBaseUrl) || (isDev && isNgrokUrl(proxyTarget));
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
  ngrokBypass: needsNgrokBypass(import.meta.env.DEV, rawApiBaseUrl, import.meta.env.VITE_DEV_PROXY_TARGET),
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
