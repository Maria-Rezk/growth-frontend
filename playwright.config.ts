import { defineConfig, devices } from '@playwright/test';

/*
  Two suites, never mixed:

  - `demo`  runs against a local Vite server in demo mode (in-memory sample
            data, no backend). It proves the UI and its flows work. It says
            nothing about compatibility with the real API.

  - `live`  runs against a real deployment, signed in with a disposable test
            account. It only runs when E2E_LIVE_BASE_URL, E2E_LIVE_EMAIL and
            E2E_LIVE_PASSWORD are set, and it only reads: it never creates,
            edits or deletes records. Point it at staging, never production.

  The browser is the locally installed Chrome (`channel: 'chrome'`), so no
  Playwright browser download is needed.
*/
const DEMO_PORT = 5175;
const liveBaseURL = process.env.E2E_LIVE_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts/test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/.artifacts/report', open: 'never' }]],
  use: {
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'demo',
      testDir: './e2e/demo',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: `http://localhost:${DEMO_PORT}`, viewport: { width: 1440, height: 900 } },
    },
    ...(liveBaseURL
      ? [{
        name: 'live',
        testDir: './e2e/live',
        use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: liveBaseURL, viewport: { width: 1440, height: 900 } },
      }]
      : []),
  ],
  webServer: {
    command: `npx vite --port ${DEMO_PORT} --strictPort`,
    url: `http://localhost:${DEMO_PORT}`,
    env: { VITE_DEMO_MODE: 'true' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
