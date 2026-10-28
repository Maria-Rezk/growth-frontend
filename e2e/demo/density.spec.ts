import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  Phones: the counts at the top of My work, Tasks and Leads stay complete but
  compact, so the work itself starts sooner. Every count is still on screen,
  zeros are not dressed as warnings, and the repeated My work summary is gone.
*/

const rowsOf = async (items: Locator) => {
  const tops = new Set<number>();
  for (let index = 0; index < await items.count(); index += 1) tops.add(Math.round((await items.nth(index).boundingBox())!.y));
  return tops.size;
};

const inside = async (page: Page, items: Locator, width: number) => {
  for (let index = 0; index < await items.count(); index += 1) {
    const box = (await items.nth(index).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
};

for (const width of [320, 375]) {
  test.describe(`compact counts at ${width}px`, () => {
    test.use({ viewport: { width, height: 812 } });

    test('My work: three counts in one row, and the list starts on the first screen', async ({ page }) => {
      await open(page, '/my-work');
      const tiles = page.locator('main .kpi-strip > *');
      await expect(tiles).toHaveCount(3);
      expect(await rowsOf(tiles)).toBe(1);
      await inside(page, tiles, width);
      await expect(page.locator('.work-row').first()).toBeInViewport();
    });

    test('Tasks: three counts in one row', async ({ page }) => {
      await open(page, '/tasks');
      const tiles = page.locator('main .kpi-strip > *');
      await expect(tiles).toHaveCount(3);
      expect(await rowsOf(tiles)).toBe(1);
      await inside(page, tiles, width);
    });

    test('Leads: every follow-up count and every pipeline stage stays visible and usable', async ({ page }) => {
      await open(page, '/leads');
      const tiles = page.locator('main .kpi-strip > *');
      await expect(tiles).toHaveCount(4);
      // Four across from 360px, two by two below it.
      expect(await rowsOf(tiles)).toBe(width < 360 ? 2 : 1);
      await inside(page, tiles, width);

      const stages = page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button');
      await expect(stages).toHaveCount(7);
      await inside(page, stages, width);
      for (let index = 0; index < 7; index += 1) {
        expect((await stages.nth(index).boundingBox())!.height).toBeGreaterThanOrEqual(24);
      }
    });

    /*
      Known bug, not fixed in this phase (audit N-6, P1): on /leads every
      filter setter calls setUrlFilters twice in one tick (the filter, then
      page=1), and the second update overwrites the first, so stage chips,
      Status, Source, Search and the Pipeline/Table switch do nothing. It
      predates the layout work (45b44a9). Unskip once N-6 is fixed.
    */
    test.fixme('a stage chip filters the list (N-6)', async ({ page }) => {
      await open(page, '/leads');
      const stages = page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button');
      await stages.filter({ hasText: 'Interested' }).click();
      await expect(stages.filter({ hasText: 'Interested' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#lead-filter')).toHaveValue('INTERESTED');
    });

    test('the helper sentences are hidden from sight but kept for screen readers', async ({ page }) => {
      await open(page, '/my-work');
      const helper = page.locator('main .kpi-strip').getByText('Late and still open.');
      await expect(helper).toHaveCount(1);
      const box = (await helper.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(1);
    });
  });
}

test.describe('zero is not a warning', () => {
  test('a zero follow-up count drops its warning colour; a real overdue count keeps it', async ({ page }) => {
    await open(page, '/leads');
    const colour = (label: string) => page.locator('main .due-tile', { hasText: label }).locator('strong').evaluate((element) => getComputedStyle(element).color);
    const neutral = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ink-secondary)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    await expect(page.locator('main .due-tile', { hasText: 'Due today' }).locator('strong')).toHaveText('0');
    expect(await colour('Due today')).toBe(neutral);
    await expect(page.locator('main .due-tile', { hasText: 'Overdue' }).locator('strong')).not.toHaveText('0');
    expect(await colour('Overdue')).not.toBe(neutral);
  });

  test('a zero My work count shows a neutral dot', async ({ page }) => {
    await open(page, '/my-work');
    await expect(page.locator('main .metric-card--zero')).toHaveCount(2);
    await expect(page.locator('main .metric-card', { hasText: 'This week' })).not.toHaveClass(/metric-card--zero/);
  });
});
