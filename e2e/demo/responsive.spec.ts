import { expect, open, test } from './fixtures';

const MOBILE = { width: 375, height: 812 };

test.describe('responsive shell', () => {
  test.use({ viewport: MOBILE });

  test('the menu opens the drawer; Escape and navigation close it', async ({ page }) => {
    await open(page, '/tasks');
    const drawer = page.locator('.sidebar');
    await expect(drawer).not.toHaveClass(/sidebar--open/);

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(drawer).toHaveClass(/sidebar--open/);
    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/sidebar--open/);

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Leads CRM' }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await expect(drawer).not.toHaveClass(/sidebar--open/);
  });

  test('the scrim closes the drawer', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: 'Close menu' }).click({ position: { x: 360, y: 400 } });
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/);
  });

  for (const path of ['/my-work', '/dashboard', '/leads', '/tasks', '/tasks/task-1', '/members', '/admin/dashboard']) {
    test(`${path} has no sideways scroll on a phone`, async ({ page }) => {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  }

  test('the create-task dialog fits the screen', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width);
  });
});
