import { ROUTES, expect, open, sidebar, test } from './fixtures';

test.describe('routes', () => {
  for (const route of ROUTES) {
    test(`${route.label} renders with no errors and no sideways scroll`, async ({ page }) => {
      await open(page, route.path);
      await expect(page.locator('main h1').first()).toHaveText(route.heading);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'page must not scroll sideways').toBe(false);
      await expect(page).toHaveTitle(/Solu1ions — Business Development$/);
    });
  }

  test('an unknown address shows the not-found page in place, inside the app', async ({ page }) => {
    await page.goto('/taks');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    // The typo stays visible and fixable, and the app around it stays.
    await expect(page).toHaveURL(/\/taks$/);
    await expect(page).toHaveTitle(/^Page not found · /);
    await expect(sidebar(page)).toBeVisible();
    await expect(page.locator('main').getByText('/taks')).toBeVisible();

    await page.getByRole('link', { name: 'Go to my home page' }).click();
    await expect(page).toHaveURL(/\/my-work$/);
  });

  test('signed out, an unknown address asks for sign-in first, then answers not found', async ({ page }) => {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    // In-app navigation: a full load would restore the demo session.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/taks');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email').fill('e2e-demo@example.test');
    await page.getByLabel('Password').fill('e2e-demo-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/taks$/);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('an unknown address on a phone keeps the menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});

test.describe('sidebar navigation', () => {
  /*
    A sidebar label names the page it opens: same words as its heading. The
    two exceptions name a dynamic thing: Client overview and Home are headed
    by the client's own name.
  */
  test('every sidebar label matches the heading of the page it opens', async ({ page }) => {
    await open(page, '/my-work');
    const links = sidebar(page).getByRole('link');
    for (let index = 0; index < await links.count(); index += 1) {
      const link = links.nth(index);
      const href = (await link.getAttribute('href'))!;
      const label = (await link.locator('.sidebar__label').textContent())!.trim();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(link).toHaveClass(/sidebar__link--active/);
      if (href === '/dashboard' || href === '/home') continue;
      // Soft, so one run lists every mismatch; waits for the page to replace the last heading.
      await expect.soft(page.locator('main h1').first(), `${href}`).toHaveText(label);
    }
  });

  test('the logo goes to the signed-in person’s home page, from anywhere', async ({ page }) => {
    await open(page, '/campaigns/campaign-1');
    await page.getByRole('link', { name: 'Solu1ions — go to your home page' }).click();
    // The demo user is staff: home is My work, not Client overview.
    await expect(page).toHaveURL(/\/my-work$/);
    await expect(page.locator('main h1').first()).toHaveText('My work');
  });

  test('every sidebar link opens its page and marks itself active', async ({ page }) => {
    await open(page, '/my-work');
    const links = sidebar(page).getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(10);
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const href = await link.getAttribute('href');
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(link).toHaveClass(/sidebar__link--active/);
    }
  });

  test('the notifications badge does not squeeze its label', async ({ page }) => {
    await open(page, '/my-work');
    const label = sidebar(page).getByRole('link', { name: /Notifications/ }).locator('.sidebar__label');
    await expect(label).toHaveText('Notifications');
    const clipped = await label.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(clipped).toBe(false);
  });

  test('a platform admin sees the platform admin section (permission-sensitive navigation)', async ({ page }) => {
    await open(page, '/my-work');
    await expect(sidebar(page).getByText('Platform admin')).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Operations dashboard' })).toBeVisible();
  });
});

test.describe('command palette', () => {
  test('opens with Ctrl+K, finds a task and closes with Escape', async ({ page }) => {
    await open(page, '/my-work');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.type('carousel');
    await expect(dialog.getByText('Revise launch carousel CTA')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
