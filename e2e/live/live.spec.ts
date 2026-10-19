import { expect, test, type Page } from '@playwright/test';

/*
  Real-backend checks. READ-ONLY: nothing here creates, edits or deletes a
  record, so it is safe to point at a shared staging environment. Use a
  disposable test account, never a person's real login, and never production.

    E2E_LIVE_BASE_URL   the deployed frontend, e.g. https://staging.example.com
    E2E_LIVE_EMAIL      a test account on that environment
    E2E_LIVE_PASSWORD   its password

  This project only exists when E2E_LIVE_BASE_URL is set (playwright.config.ts).
*/
const email = process.env.E2E_LIVE_EMAIL ?? '';
const password = process.env.E2E_LIVE_PASSWORD ?? '';

test.skip(!email || !password, 'E2E_LIVE_EMAIL and E2E_LIVE_PASSWORD are required for the live suite.');

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('main h1').first()).toBeVisible();
}

/** Failed API calls (5xx, or 4xx other than the expected 401 before sign-in / 403 for a role) during a page visit. */
function watchFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    const status = response.status();
    if (!response.url().includes('/api/')) return;
    if (status >= 500 || (status >= 400 && status !== 401 && status !== 403)) failures.push(`${status} ${response.request().method()} ${response.url()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

test('signs in, survives a reload, and signs out', async ({ page }) => {
  await signIn(page);
  await page.reload();
  // The access token is memory-only; a reload must restore it from the refresh cookie.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/my-work');
  await expect(page).toHaveURL(/\/login/);
});

test('a wrong password is refused with a message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(`${password}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

const READ_ONLY_ROUTES = [
  '/my-work', '/dashboard', '/brand-profile', '/content-plans', '/posts', '/campaigns', '/leads',
  '/tasks', '/approvals', '/responsibilities', '/automations', '/reports', '/members', '/notifications',
  '/admin/dashboard', '/admin/employees', '/admin/clients',
];

test('every page the account can open loads without failed requests', async ({ page }) => {
  await signIn(page);
  const failures = watchFailures(page);
  const visited: string[] = [];
  for (const path of READ_ONLY_ROUTES) {
    await page.goto(path);
    // A route this role may not see redirects away; that is a pass, not a failure.
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    visited.push(`${path} -> ${new URL(page.url()).pathname}`);
  }
  test.info().annotations.push({ type: 'visited', description: visited.join('\n') });
  expect(failures, 'no 4xx/5xx API responses beyond 401/403').toEqual([]);
});
