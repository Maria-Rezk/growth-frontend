import { expect, test, type Page } from '@playwright/test';
import { StubApi, taskId, type LoggedRequest } from './stubApi';

/*
  Automatic sync, phase 1: what a person sees. Real build, stubbed API
  (stubApi.ts), virtual time. Each test changes data "on the server" behind
  the browser's back, lets the clock run, and checks the screen caught up
  without anything else moving.
*/

const START = new Date('2026-11-12T09:00:00Z').getTime();
const synced = (request: LoggedRequest) => !request.endpoint.includes('/notifications') && request.method === 'GET';

async function boot(page: Page, api: StubApi, path: string) {
  await page.clock.install({ time: START });
  await api.attach(page);
  // Any "Updating…" that ever appears, counted from the first paint.
  await page.addInitScript(() => {
    (window as unknown as { __updating: number }).__updating = 0;
    new MutationObserver(() => {
      if (document.body?.innerText.includes('Updating…')) (window as unknown as { __updating: number }).__updating += 1;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(path);
}

/** Run the page's clock forward in 5 s steps, giving each step's requests time to come back. */
async function advance(page: Page, api: StubApi, ms: number) {
  for (let done = 0; done < ms; done += 5_000) {
    await page.clock.runFor(Math.min(5_000, ms - done));
    api.setNow(Date.now());
    await page.waitForTimeout(50);
  }
}

const updatingSeen = (page: Page) => page.evaluate(() => (window as unknown as { __updating: number }).__updating);

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    // Bubbles, as the browser's own does: React Query listens on window, the notification sync on document.
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, hidden);
}

test('Tasks board: another person\'s change appears; filters, scroll and the page stay put; nothing says "Updating…"', async ({ page }) => {
  const api = new StubApi({ companies: 1, tasksPerCompany: 40 });
  await page.setViewportSize({ width: 1280, height: 700 });
  await boot(page, api, '/tasks?priority=MEDIUM');
  await expect(page.locator('main .kanban-card').first()).toBeVisible({ timeout: 20_000 });
  // An instant jump, not a wheel: a wheel's smooth scroll can still be settling when the position is read.
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(600);
  const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));

  api.editTask(0, 0, { title: 'Renamed by someone else' });
  await advance(page, api, 65_000);

  await expect(page.locator('main .kanban-card', { hasText: 'Renamed by someone else' })).toHaveCount(1);
  expect(await page.evaluate(() => Math.round(window.scrollY)), 'scroll position').toBe(scrollBefore);
  await expect(page).toHaveURL(/priority=MEDIUM/);
  await expect(page.locator('#task-priority-filter')).toHaveValue('MEDIUM');
  expect(await updatingSeen(page), '"Updating…" appearances').toBe(0);
});

test('Table view: a new task appears and the sort the person chose holds', async ({ page }) => {
  const api = new StubApi({ companies: 1, tasksPerCompany: 6 });
  await boot(page, api, '/tasks?view=table');
  const table = page.locator('main table');
  await expect(table).toBeVisible({ timeout: 20_000 });
  // The table opens sorted by Task, A–Z; the person flips it to Z–A.
  const header = table.locator('thead th').first();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  // dispatchEvent: the fake clock also holds requestAnimationFrame, which a normal click waits on.
  await header.getByRole('button').dispatchEvent('click');
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  const sortBefore = await header.getAttribute('aria-sort');

  api.addTask(0, 'Zz arrived later');
  await advance(page, api, 65_000);
  // Arrived, and first: the Z–A order held through the refresh.
  await expect(table.locator('tbody tr').first()).toContainText('Zz arrived later');
  expect(await header.getAttribute('aria-sort')).toBe(sortBefore);
  expect(await updatingSeen(page)).toBe(0);
});

test('Task detail: a new comment appears; the one being typed is kept, with focus', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  await boot(page, api, `/tasks/${taskId(0, 0)}`);
  await expect(page.locator('main h1')).toHaveText('Task 1.1', { timeout: 20_000 });
  const box = page.getByRole('textbox', { name: 'Comment' });
  await box.fill('Half-written reply');

  api.addComment(0, 0, 'Comment from a colleague');
  api.editTask(0, 0, { title: 'Task 1.1 (edited)' });
  await advance(page, api, 35_000);

  await expect(page.getByText('Comment from a colleague')).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Task 1.1 (edited)');
  await expect(box).toHaveValue('Half-written reply');
  await expect(box).toBeFocused();
});

test('an open dialog with typing in it stays open and keeps its text while the board refreshes behind it', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  await boot(page, api, '/tasks');
  await expect(page.locator('main .kanban-card').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'New task' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Title/).first().fill('Draft in progress');

  api.editTask(0, 1, { title: 'Changed while the dialog was open' });
  await advance(page, api, 125_000);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/Title/).first()).toHaveValue('Draft in progress');
  await expect(page.locator('main .kanban-card', { hasText: 'Changed while the dialog was open' })).toHaveCount(1);
});

test('a status change wins over a poll that was already on its way', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  await boot(page, api, `/tasks/${taskId(0, 0)}`);
  await expect(page.locator('main h1')).toHaveText('Task 1.1', { timeout: 20_000 });
  await expect(page.locator('#task-status')).toHaveValue('TODO');

  // The next read of this task is held: sent before the change, answered after it.
  const held = api.holdNext(({ method, endpoint }) => method === 'GET' && endpoint === 'GET /companies/:id/tasks/:id');
  await advance(page, api, 31_000);
  await held.arrived;

  await page.locator('#task-status').selectOption('IN_PROGRESS');
  await expect(page.locator('#task-status')).toHaveValue('IN_PROGRESS');
  held.release(); // the stale read, still saying TODO
  await page.waitForTimeout(300);
  await advance(page, api, 5_000);
  await expect(page.locator('#task-status')).toHaveValue('IN_PROGRESS');
});

test('a hidden tab sends nothing; coming back refreshes once, not once per missed tick', async ({ page }) => {
  const api = new StubApi({ companies: 1 });
  await boot(page, api, `/tasks/${taskId(0, 0)}`);
  await expect(page.locator('main h1')).toHaveText('Task 1.1', { timeout: 20_000 });
  await advance(page, api, 5_000);

  await setHidden(page, true);
  const hiddenFrom = api.log.length;
  await advance(page, api, 5 * 60_000);
  expect(api.log.slice(hiddenFrom).filter(synced)).toEqual([]);

  api.editTask(0, 0, { title: 'Changed while away' });
  const backFrom = api.log.length;
  await setHidden(page, false);
  await advance(page, api, 5_000);
  await expect(page.locator('main h1')).toHaveText('Changed while away');
  const back = api.log.slice(backFrom).filter(synced);
  const perEndpoint: Record<string, number> = {};
  back.forEach((request) => { perEndpoint[request.endpoint] = (perEndpoint[request.endpoint] ?? 0) + 1; });
  Object.values(perEndpoint).forEach((count) => expect(count).toBeLessThanOrEqual(1));
});

test('offline: nothing is sent, nothing is blanked; back online it catches up once', async ({ page, context }) => {
  const api = new StubApi({ companies: 1 });
  await boot(page, api, '/tasks');
  await expect(page.locator('main .kanban-card').first()).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  const offlineFrom = api.log.length;
  api.editTask(0, 0, { title: 'Changed while offline' });
  await advance(page, api, 3 * 60_000);
  expect(api.log.slice(offlineFrom).filter(synced)).toEqual([]);
  await expect(page.locator('main .kanban-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry|Try again/ })).toHaveCount(0);

  await context.setOffline(false);
  const onlineFrom = api.log.length;
  await advance(page, api, 5_000);
  await expect(page.locator('main .kanban-card', { hasText: 'Changed while offline' })).toHaveCount(1);
  const list = api.log.slice(onlineFrom).filter((request) => request.endpoint === 'GET /companies/:id/tasks');
  expect(list.length).toBeLessThanOrEqual(2); // the board and its alert tiles, once each
});

test('a failing server keeps the board on screen and backs off; it recovers on its own', async ({ page }) => {
  // Two reads per endpoint per hour: what loading the page takes (the board and its alert tiles share one endpoint).
  const api = new StubApi({ companies: 1, rateLimit: { limit: 2, windowMs: 60 * 60_000, sharedBucket: true } });
  await boot(page, api, '/tasks');
  await expect(page.locator('main .kanban-card').first()).toBeVisible({ timeout: 20_000 });

  // Every further read of the list is now a 429 (two per hour allowed, both used).
  await advance(page, api, 10 * 60_000);
  const listCalls = api.log.filter((request) => request.endpoint === 'GET /companies/:id/tasks');
  const limited = listCalls.filter((request) => request.status === 429);
  expect(limited.length).toBeGreaterThan(0);
  // At 60 s that would be ~20 calls (board + tiles) in ten minutes; after a 429 each waits five.
  expect(listCalls.length).toBeLessThanOrEqual(8);
  // Never retried on the spot: no two 429s for one endpoint within the same virtual second.
  const times = limited.map((request) => request.at).sort((a, b) => a - b);
  for (let i = 2; i < times.length; i += 1) expect(times[i] - times[i - 2]).toBeGreaterThan(1_000);
  await expect(page.locator('main .kanban-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry|Try again/ })).toHaveCount(0);
});

test('pages outside phase 1 do not poll', async ({ page }) => {
  const api = new StubApi({ companies: 2 });
  for (const path of ['/reports', '/posts', '/content-plans', '/responsibilities']) {
    await boot(page, api, path);
    await expect(page.locator('main h1').first()).toBeVisible({ timeout: 20_000 });
    await advance(page, api, 5_000);
    const from = api.log.length;
    await advance(page, api, 5 * 60_000);
    expect(api.log.slice(from).filter(synced), path).toEqual([]);
    await page.goto('about:blank');
  }
});
