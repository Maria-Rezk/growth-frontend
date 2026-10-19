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

  test('an unknown address shows the not-found page', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page).toHaveURL(/\/404$/);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});

test.describe('sidebar navigation', () => {
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
