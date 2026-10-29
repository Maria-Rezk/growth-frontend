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
