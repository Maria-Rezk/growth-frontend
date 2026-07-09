const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export const env = {
  apiBaseUrl: rawApiBaseUrl.replace(/\/$/, ''),
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 25000),
  appName: import.meta.env.VITE_APP_NAME ?? 'Solu1ions Growth OS',
};

export function validateRuntimeEnv() {
  if (!env.apiBaseUrl) throw new Error('VITE_API_BASE_URL is required.');
  if (!Number.isFinite(env.apiTimeoutMs) || env.apiTimeoutMs < 1000) {
    throw new Error('VITE_API_TIMEOUT_MS must be a number greater than or equal to 1000.');
  }
}
