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
    await page.locator('.sidebar-scrim').click({ position: { x: 360, y: 400 } });
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/);
  });

  test('the closed drawer is out of the tab order', async ({ page }) => {
    await open(page, '/tasks');
    const reachable = await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('.sidebar a');
      link?.focus();
      return document.activeElement === link;
    });
    expect(reachable).toBe(false);
  });

  test('the open drawer holds focus and hands it back on close', async ({ page }) => {
    await open(page, '/tasks');
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.sidebar')))).toBe(true);

    // Shift+Tab from the first control wraps inside the drawer instead of escaping to the page.
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.sidebar')))).toBe(true);
    expect(await page.evaluate(() => document.querySelector('.main-shell')?.hasAttribute('inert'))).toBe(true);

    await drawer.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/);
    await expect(menuButton).toBeFocused();
    expect(await page.evaluate(() => document.querySelector('.main-shell')?.hasAttribute('inert'))).toBe(false);
  });

  for (const path of ['/my-work', '/dashboard', '/leads', '/tasks', '/tasks/task-1', '/members', '/admin/dashboard']) {
    test(`${path} has no sideways scroll on a phone`, async ({ page }) => {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    });
  }

  for (const width of [320, 375]) {
    test(`segmented controls show every option at ${width}px, none clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      for (const path of ['/tasks', '/automations']) {
        await open(page, path);
        const controls = page.locator('main .segmented');
        for (let index = 0; index < await controls.count(); index += 1) {
          const control = controls.nth(index);
          expect(await control.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
          const frame = (await control.boundingBox())!;
          const options = control.getByRole('button');
          for (let option = 0; option < await options.count(); option += 1) {
            // Horizontally inside both the control and the screen: nothing scrolled out of sight.
            const box = (await options.nth(option).boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(frame.x);
            expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.height).toBeGreaterThanOrEqual(24);
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      }
    });
  }

  test('the last scope option is reachable and selectable from the keyboard on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, '/tasks');
    const drafts = page.getByRole('group', { name: 'Task scope' }).getByRole('button', { name: 'My drafts' });
    await drafts.focus();
    await page.keyboard.press('Enter');
    await expect(drafts).toHaveAttribute('aria-pressed', 'true');
    await expect(drafts).toBeInViewport({ ratio: 1 });
  });

  test('the create-task dialog fits the screen', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width);
  });
});
