import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { StubApi, taskId, type LoggedRequest } from './stubApi';

/*
  Request counts per screen: what loading it costs, then five minutes with the
  tab in front and nobody touching it. Virtual time (page.clock), so five
  minutes take a few seconds. Run on this branch and on the commit before it
  (SYNC_TAG=before|after) and compare e2e/.artifacts/sync-measure-*.json.

  Notifications are listed apart: they have their own sync and must not
  change.
*/

const TAG = process.env.SYNC_TAG ?? 'after';
const MINUTES = 5;
const START = new Date('2026-11-12T09:00:00Z').getTime();
const results: Record<string, unknown> = {};

const isNotification = (request: LoggedRequest) => request.endpoint.includes('/notifications');

async function settle(page: Page, api: StubApi, elapsed: { ms: number }, stepMs: number) {
  await page.clock.runFor(stepMs);
  elapsed.ms += stepMs;
  api.setNow(elapsed.ms);
  // Let the requests the timers started reach the stub and come back.
  await page.waitForTimeout(40);
}

async function measure(page: Page, api: StubApi, path: string, ready: () => Promise<void>) {
  await page.clock.install({ time: START });
  await api.attach(page);
  await page.goto(path);
  await ready();
  // Boot: everything the screen asks for before anybody waits.
  const elapsed = { ms: 0 };
  for (let i = 0; i < 4; i += 1) await settle(page, api, elapsed, 500);
  const bootEnd = api.log.length;
  const boot = api.log.slice(0, bootEnd);

  for (let s = 0; s < MINUTES * 60; s += 5) await settle(page, api, elapsed, 5_000);
  const steady = api.log.slice(bootEnd);

  const summarise = (rows: LoggedRequest[]) => {
    const totals: Record<string, number> = {};
    rows.forEach((row) => { totals[row.endpoint] = (totals[row.endpoint] ?? 0) + 1; });
    return totals;
  };
  return {
    boot: { total: boot.length, byEndpoint: summarise(boot) },
    steady: {
      minutes: MINUTES,
      totalExcludingNotifications: steady.filter((row) => !isNotification(row)).length,
      perMinuteExcludingNotifications: +(steady.filter((row) => !isNotification(row)).length / MINUTES).toFixed(2),
      notifications: steady.filter(isNotification).length,
      byEndpoint: summarise(steady),
      status429: steady.filter((row) => row.status === 429).length,
    },
  };
}

test.afterAll(() => {
  mkdirSync('e2e/.artifacts', { recursive: true });
  writeFileSync(`e2e/.artifacts/sync-measure-${TAG}.json`, JSON.stringify(results, null, 2));
});

test('Tasks board', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  results.tasksBoard = await measure(page, api, '/tasks', async () => {
    await expect(page.locator('main .kanban-card').first()).toBeVisible({ timeout: 20_000 });
  });
});

test('Task detail', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  results.taskDetail = await measure(page, api, `/tasks/${taskId(0, 2)}`, async () => {
    await expect(page.locator('main h1')).toHaveText('Task 1.3', { timeout: 20_000 });
  });
});

test('Approval queue', async ({ page }) => {
  const api = new StubApi({ companies: 3 });
  results.approvalQueue = await measure(page, api, '/approvals', async () => {
    await expect(page.locator('main h1')).toHaveText('Approval queue', { timeout: 20_000 });
  });
});

for (const clients of [1, 5, 10]) {
  test(`My work, ${clients} clients`, async ({ page }) => {
    const api = new StubApi({ companies: clients });
    results[`myWork${clients}`] = await measure(page, api, '/my-work', async () => {
      await expect(page.locator('main h1')).toHaveText('My work', { timeout: 20_000 });
    });
  });
}

test('Leads', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  results.leads = await measure(page, api, '/leads', async () => {
    await expect(page.locator('main h1')).toHaveText('Leads', { timeout: 20_000 });
  });
});

test('Reports (not synced: control)', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  results.reportsControl = await measure(page, api, '/reports', async () => {
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
  });
});

test('three sessions at once on Task detail, one shared rate-limit bucket', async ({ browser }) => {
  // limit 100/min per endpoint, shared by every session: the deployed throttle if the proxy is not trusted.
  const api = new StubApi({ companies: 1, rateLimit: { limit: 100, windowMs: 60_000, sharedBucket: true } });
  const pages: Page[] = [];
  for (const session of ['A', 'B', 'C']) {
    const context = await browser.newContext({ baseURL: 'http://localhost:5176', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.clock.install({ time: START });
    await api.attach(page, session);
    await page.goto(`/tasks/${taskId(0, 2)}`);
    await expect(page.locator('main h1')).toHaveText('Task 1.3', { timeout: 20_000 });
    pages.push(page);
  }
  const bootEnd = api.log.length;
  let elapsed = 0;
  for (let s = 0; s < MINUTES * 60; s += 5) {
    await Promise.all(pages.map((page) => page.clock.runFor(5_000)));
    elapsed += 5_000;
    api.setNow(elapsed);
    await pages[0].waitForTimeout(40);
  }
  const steady = api.log.slice(bootEnd);
  const perEndpointPerMinute: Record<string, number> = {};
  steady.filter((row) => !isNotification(row)).forEach((row) => { perEndpointPerMinute[row.endpoint] = (perEndpointPerMinute[row.endpoint] ?? 0) + 1 / MINUTES; });
  results.threeSessionsTaskDetail = {
    sessions: 3,
    totalExcludingNotifications: steady.filter((row) => !isNotification(row)).length,
    perEndpointPerMinute: Object.fromEntries(Object.entries(perEndpointPerMinute).map(([key, value]) => [key, +value.toFixed(2)])),
    status429: steady.filter((row) => row.status === 429).length,
  };
  await Promise.all(pages.map((page) => page.context().close()));
});
