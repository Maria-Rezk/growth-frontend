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
