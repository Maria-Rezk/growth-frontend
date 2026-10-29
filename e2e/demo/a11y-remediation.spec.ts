import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  Regression tests for the accessibility findings A-1 to A-7 (see the audit
  document, "V-3 findings"). Each runs axe on the one component it fixed, in
  light and dark, so the main suite catches a regression in seconds; the full
  sweep is `npm run e2e:a11y`.
*/

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    try { window.localStorage.setItem('growth.theme', value); } catch { /* storage blocked */ }
  }, theme);
}

/** Violations of the given rules inside `selector`, as "rule: target". */
async function violations(page: Page, selector: string, rules?: string[]) {
  let builder = new AxeBuilder({ page }).include(selector).withTags(TAGS);
  if (rules) builder = builder.withRules(rules);
  const { violations: found } = await builder.analyze();
  return found.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`));
}

const THEMES = ['light', 'dark'] as const;

/** The first unread item on /notifications, pinned by its title so it stays the same item once read. */
async function firstUnread(page: Page) {
  const unread = page.locator('main article.notification-item').filter({ has: page.getByRole('button', { name: 'Mark read' }) }).first();
  const title = (await unread.locator('.notification-item__open').innerText()).trim();
  return page.locator('main article.notification-item').filter({ has: page.locator('.notification-item__open', { hasText: title }) }).first();
}

test.describe('A-1 content calendar is a table of weeks', () => {
  for (const theme of THEMES) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      test(`${theme}, ${viewport.width}px: rows, named headers and days, no axe violations`, async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize(viewport);
        await open(page, '/posts?view=calendar');
        const table = page.getByRole('table', { name: /^Content calendar, / });
        await expect(table).toBeVisible();
        await expect(page.locator('main [role="grid"]')).toHaveCount(0);
        await expect(table.getByRole('columnheader', { name: 'Monday' })).toBeVisible();
        const rows = table.getByRole('row');
        expect(await rows.count()).toBeGreaterThanOrEqual(5);
        for (const row of await rows.all()) await expect(row.locator(':scope > [role="cell"], :scope > [role="columnheader"]')).toHaveCount(7);
        // A day says its full date and how many posts it holds.
        await expect(table.getByRole('cell', { name: /, \d+ posts?$|, no posts$/ }).first()).toBeVisible();
        expect(await violations(page, '.calendar')).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      });
    }
  }

  test('keyboard: month buttons, then the posts in date order; a post still opens', async ({ page }) => {
    await open(page, '/posts?view=calendar');
    const calendar = page.locator('.calendar');
    await calendar.getByRole('button', { name: 'Previous month' }).focus();
    await page.keyboard.press('Tab');
    await expect(calendar.getByRole('button', { name: 'Today' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(calendar.getByRole('button', { name: 'Next month' })).toBeFocused();
    await page.keyboard.press('Tab');
    const first = calendar.locator('.calendar__grid a').first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAccessibleName(/, (Draft|Scheduled|Ready For Client|Approved|Published|In Internal Review|Changes Requested|Canceled)(, |$)/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/posts\/[^/?]+$/);
  });
});

test.describe('A-2 notification items: open and mark read are separate controls', () => {
  for (const theme of THEMES) {
    test(`${theme}: the page and the bell panel have no nested or misused roles`, async ({ page }) => {
      await useTheme(page, theme);
      await open(page, '/notifications');
      expect(await violations(page, 'main')).toEqual([]);
      await page.locator('.topbar').getByRole('button', { name: /^Notifications/ }).click();
      expect(await violations(page, '.notifications-panel')).toEqual([]);
    });
  }

  test('each item: a named open button, its message readable, its own Mark read button', async ({ page }) => {
    await open(page, '/notifications');
    const item = await firstUnread(page);
    await expect(item).not.toHaveAttribute('role', 'button');
    const opener = item.locator('.notification-item__open');
    await expect(opener).toHaveAccessibleName(/, unread$/);
    // The message and time are content, not hidden behind a label.
    await expect(item.locator('p')).toBeVisible();
    await expect(item.locator('time')).toHaveAttribute('datetime', /\d{4}-\d\d-\d\dT/);

    // Keyboard: Tab goes open, then Mark read, for the same item.
    await opener.focus();
    await page.keyboard.press('Tab');
    await expect(item.getByRole('button', { name: 'Mark read' })).toBeFocused();
    // Enter on Mark read marks it read and does not open it.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(opener).not.toHaveAccessibleName(/, unread$/);
    await expect(item.getByRole('button', { name: 'Mark read' })).toHaveCount(0);
  });

  test('a click on the Mark read button does not also open the item; a click on the card does', async ({ page }) => {
    await open(page, '/notifications');
    const item = await firstUnread(page);
    await item.getByRole('button', { name: 'Mark read' }).click();
    await expect(item.getByRole('button', { name: 'Mark read' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/notifications$/);
    // Anywhere on the card, here over the message text, still opens it: a real
    // mouse click there lands on the title button's stretched area.
    const message = (await item.locator('p').boundingBox())!;
    await page.mouse.click(message.x + message.width / 2, message.y + message.height / 2);
    await expect(page).not.toHaveURL(/\/notifications$/);
  });

  test('Enter and Space on the title open it, with one history entry', async ({ page }) => {
    for (const key of ['Enter', ' ']) {
      await open(page, '/notifications');
      const opener = page.locator('main .notification-item__open').first();
      await opener.focus();
      await page.keyboard.press(key);
      await expect(page).not.toHaveURL(/\/notifications$/);
      // Once: one step back returns to the list.
      await page.goBack();
      await expect(page).toHaveURL(/\/notifications$/);
    }
  });

  test('the focus ring is drawn around the whole card', async ({ page }) => {
    await open(page, '/notifications');
    const item = page.locator('main article.notification-item').first();
    await item.locator('.notification-item__open').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await item.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  });
});

test.describe('A-3 search: a combobox with a named list of results', () => {
  async function openPalette(page: Page) {
    await open(page, '/my-work');
    await page.locator('.topbar .search-trigger').click();
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  for (const theme of THEMES) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      test(`${theme}, ${viewport.width}px: no axe violations with results and when empty`, async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize(viewport);
        const dialog = await openPalette(page);
        await page.keyboard.type('ca');
        await expect(dialog.getByRole('option').first()).toBeVisible();
        expect(await violations(page, '.palette')).toEqual([]);
        await page.keyboard.press('Control+a');
        await page.keyboard.type('zzqq');
        await expect(dialog.getByRole('status')).toHaveText('Nothing matches “zzqq” on this client.');
        expect(await violations(page, '.palette')).toEqual([]);
      });
    }
  }

  test('the input owns the named list, and says whether it has options', async ({ page }) => {
    const dialog = await openPalette(page);
    const input = dialog.getByRole('combobox', { name: 'Search' });
    const list = dialog.getByRole('listbox', { name: 'Search results' });
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    // Before typing, the instructions describe the input.
    await expect(input).toHaveAccessibleDescription('Type at least two characters. ↑↓ to move, Enter to open.');
    await page.keyboard.type('ca');
    await expect(list.getByRole('option').first()).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    // Results are grouped under their kind's name.
    await expect(list.getByRole('group', { name: 'Tasks' })).toBeVisible();
  });

  test('the count and the empty state are announced once, from one status', async ({ page }) => {
    const dialog = await openPalette(page);
    const status = dialog.getByRole('status');
    await expect(status).toHaveCount(1);
    await page.keyboard.type('ca');
    const options = dialog.getByRole('option');
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    await expect(status).toHaveText(`${count} ${count === 1 ? 'result' : 'results'}`);
    // The count is not also shown as a visible hint.
    await expect(dialog.locator('.palette__hint')).toHaveCount(0);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('zzqq');
    await expect(status).toHaveText('Nothing matches “zzqq” on this client.');
    await expect(dialog.getByText('Nothing matches “zzqq” on this client.')).toHaveCount(1);
  });

  test('arrows move the active option, Enter opens it; Tab never lands on an option', async ({ page }) => {
    const dialog = await openPalette(page);
    const input = dialog.getByRole('combobox', { name: 'Search' });
    await page.keyboard.type('ca');
    const options = dialog.getByRole('option');
    await expect(options.first()).toBeVisible();
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveAttribute('aria-activedescendant', (await options.first().getAttribute('id'))!);

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!);
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    // Focus stays in the input throughout.
    await expect(input).toBeFocused();

    for (const option of await options.all()) await expect(option).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('option');
    await input.focus();

    // Enter opens the active result: its page replaces My work.
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/\/my-work$/);
  });

  test('Escape closes it and returns focus to the search button', async ({ page }) => {
    await openPalette(page);
    await page.keyboard.type('ca');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
    await expect(page.locator('.topbar .search-trigger')).toBeFocused();
  });
});

test.describe('A-4 phone menu: a dialog on an element that allows it', () => {
  for (const theme of THEMES) {
    test(`${theme}, 375px: the open menu is a named modal dialog holding the main navigation, no axe violations`, async ({ page }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 375, height: 812 });
      await open(page, '/my-work');
      const button = page.locator('.topbar').getByRole('button', { name: /menu/i }).first();
      await button.click();
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('aria-modal', 'true');
      expect(await menu.evaluate((element) => element.tagName)).toBe('DIV');
      await expect(menu.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      expect(await violations(page, '#app-sidebar')).toEqual([]);

      // Focus is inside, Tab stays inside, Escape closes and returns focus.
      expect(await page.evaluate(() => document.getElementById('app-sidebar')!.contains(document.activeElement))).toBe(true);
      for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('app-sidebar')!.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();
    });
  }

  test('on desktop the sidebar is a named region, not a dialog, and all of it is inside a landmark', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const region = page.getByRole('region', { name: 'Menu' });
    await expect(region).toBeVisible();
    expect(await region.evaluate((element) => element.tagName)).toBe('DIV');
    await expect(region.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(await violations(page, '#app-sidebar', ['region', 'aria-allowed-role', 'landmark-unique'])).toEqual([]);
  });
});

test.describe('A-5 one banner, and every landmark distinguishable', () => {
  const LANDMARK_RULES = ['landmark-unique', 'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo', 'landmark-complementary-is-top-level', 'region'];

  for (const theme of THEMES) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      test(`${theme}, ${viewport.width}px: a detail page and an open dialog`, async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize(viewport);
        await open(page, '/tasks/task-1');
        await expect(page.getByRole('banner')).toHaveCount(1);
        expect(await violations(page, 'body', LANDMARK_RULES)).toEqual([]);

        await open(page, '/leads');
        await page.locator('main').getByRole('button', { name: 'New lead', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Create lead' });
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('banner')).toHaveCount(1);
        await expect(page.getByRole('contentinfo')).toHaveCount(0);
        expect(await violations(page, 'body', LANDMARK_RULES)).toEqual([]);
        // The dialog keeps its title, Close button and footer actions.
        await expect(dialog.getByRole('heading', { name: 'Create lead' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Create lead' })).toBeVisible();
      });
    }
  }
});

test.describe('A-6 the skip link works on the sign-in pages', () => {
  const PUBLIC = ['/login', '/forgot-password', '/accept-invitation?token=demo-invite-token'];

  async function signedOut(page: Page) {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
  }

  async function goInApp(page: Page, to: string) {
    // In-app navigation: a full load would restore the demo session.
    await page.evaluate((path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, to);
    await expect(page.locator('h1').first()).toBeVisible();
  }

  for (const theme of THEMES) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      test(`${theme}, ${viewport.width}px: a target exists on each page and axe finds nothing`, async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize(viewport);
        await signedOut(page);
        for (const path of PUBLIC) {
          await goInApp(page, path);
          await expect(page.locator('main#main-content')).toHaveCount(1);
          expect(await violations(page, 'body'), path).toEqual([]);
        }
      });
    }
  }

  test('keyboard: the skip link comes first, and Enter on it moves focus to the page', async ({ page }) => {
    await signedOut(page);
    for (const path of PUBLIC) {
      await goInApp(page, path);
      // First in tab order: the first focusable element in the document.
      const first = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .find((element) => !element.hasAttribute('disabled'))?.className);
      expect(first, path).toBe('skip-link');
      const skip = page.getByRole('link', { name: 'Skip to main content' });
      await skip.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('main#main-content')).toBeFocused();
      // The next Tab continues inside the page, not back at the top.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('main')!.contains(document.activeElement))).toBe(true);
    }
  });
});
