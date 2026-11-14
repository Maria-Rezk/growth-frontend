import { defineConfig, devices } from '@playwright/test';

/*
  Automatic-sync suite: the real build (demo mode off) against a stubbed API
  (e2e/sync/stubApi.ts), so request counts are the app's own. Its own config
  and port, so the demo suite never starts this server.

    npx playwright test -c playwright.sync.config.ts
*/
const SYNC_PORT = 5176;

export default defineConfig({
  testDir: './e2e/sync',
  outputDir: './e2e/.artifacts/sync-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: `http://localhost:${SYNC_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${SYNC_PORT} --strictPort`,
    url: `http://localhost:${SYNC_PORT}`,
    env: { VITE_DEMO_MODE: 'false', VITE_API_BASE_URL: '/api' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
