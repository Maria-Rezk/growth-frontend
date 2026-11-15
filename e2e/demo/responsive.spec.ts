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
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Leads', exact: true }).click();
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
        /*
          Measured in one synchronous pass, and polled until the page has
          settled: the counts load after the heading and shift the layout, so
          a control and its options measured at different moments disagree.
          A real clip still fails: it never settles to an empty list.
        */
        await expect.poll(() => page.evaluate((viewport) => {
          const problems: string[] = [];
          document.querySelectorAll('main .segmented').forEach((control) => {
            const frame = control.getBoundingClientRect();
            if (control.scrollWidth > control.clientWidth + 1) problems.push(`${control.getAttribute('aria-label')}: scrolls`);
            control.querySelectorAll('button').forEach((option) => {
              const box = option.getBoundingClientRect();
              const name = `${control.getAttribute('aria-label')} / ${option.textContent}`;
              // Horizontally inside both the control and the screen: nothing scrolled out of sight.
              if (box.left < frame.left - 0.5 || box.right > frame.right + 0.5) problems.push(`${name}: outside its control`);
              if (box.right > viewport) problems.push(`${name}: off screen`);
              if (box.height < 24) problems.push(`${name}: ${box.height}px tall`);
            });
          });
          return problems;
        }, width)).toEqual([]);
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
