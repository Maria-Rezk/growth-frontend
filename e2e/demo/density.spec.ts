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

    test('a stage chip filters the list, and a second press clears it (N-6)', async ({ page }) => {
      await open(page, '/leads');
      const interested = page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button').filter({ hasText: 'Interested' });
      await interested.click();
      await expect(interested).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#lead-filter')).toHaveValue('INTERESTED');
      await interested.click();
      await expect(interested).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#lead-filter')).toHaveValue('');
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

test.describe('My work says each count once', () => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    test(`no repeated summary line at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/my-work');
      // task-1's second step is the demo user's but not reached yet, so it is not in My work (guide 3.7).
      await expect(page.getByRole('heading', { name: 'This week (2)' })).toBeVisible();
      await expect(page.locator('main .metric-card', { hasText: 'This week' }).locator('strong')).toHaveText('2');
      await expect(page.locator('main').getByText('2 this week')).toHaveCount(0);
    });
  }
});

test.describe('Leads filters on phones (N-7)', () => {
  const PHONES = [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
  const box = async (locator: Locator) => (await locator.boundingBox())!;

  for (const viewport of PHONES) {
    test(`${viewport.width}x${viewport.height}: the chips are the status filter, the view switch sits in the header`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/leads');

      // Status: the dropdown is gone; all seven stage chips are there instead.
      await expect(page.locator('#lead-filter')).toBeHidden();
      const stages = page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button');
      await expect(stages).toHaveCount(7);
      for (let index = 0; index < 7; index += 1) await expect(stages.nth(index)).toBeVisible();

      // One view switch, in the header row beside "New lead", not cramped.
      const views = page.getByRole('group', { name: 'Lead view' });
      await expect(views).toHaveCount(1);
      const newLead = await box(page.locator('main').getByRole('button', { name: 'New lead' }));
      const view = await box(views);
      expect(Math.abs((view.y + view.height / 2) - (newLead.y + newLead.height / 2))).toBeLessThanOrEqual(4);
      expect(view.x).toBeGreaterThanOrEqual(newLead.x + newLead.width + 16);
      expect(view.x + view.width).toBeLessThanOrEqual(viewport.width - 16 + 0.5);
      for (const option of await views.getByRole('button').all()) expect((await box(option)).height).toBeGreaterThanOrEqual(32);

      // Scope, Search and Source: one full row each, in that order.
      const card = await box(page.locator('main .toolbar--leads'));
      const scope = await box(page.getByRole('group', { name: 'Lead scope' }));
      const search = await box(page.locator('#lead-search'));
      const source = await box(page.locator('#lead-source-filter'));
      expect(scope.y).toBeLessThan(search.y);
      expect(search.y).toBeLessThan(source.y);
      for (const control of [search, source]) expect(control.width).toBeGreaterThan(card.width - 2 * 16 - 4);

      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    });
  }

  test('a chip sets and clears the status; the active one is marked, the "×" is not read out', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/leads');
    const group = page.getByRole('group', { name: 'Filter by pipeline stage' });
    const interested = group.getByRole('button', { name: 'Interested 1', exact: true });
    await interested.click();
    await expect(page).toHaveURL(/status=INTERESTED/);
    await expect(interested).toHaveAttribute('aria-pressed', 'true');
    await expect(interested.locator('.pipeline-summary__clear')).toBeVisible();
    await expect(page.locator('main .kanban-card')).toHaveCount(1);
    await expect(page.locator('main .kanban-card')).toContainText('Nour Clinic');
    // Pressing it again is "All statuses".
    await interested.click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(interested).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('main .kanban-card')).toHaveCount(3);
  });

  test('Tab goes New lead, Pipeline, Table, and never into the hidden Status dropdown', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/leads');
    await page.locator('main').getByRole('button', { name: 'New lead' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Pipeline' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' })).toBeFocused();
    await page.locator('#lead-search').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#lead-source-filter')).toBeFocused();
  });

  test('filters and view survive resizing between phone and desktop', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/leads');
    await page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button', { name: /^Interested/ }).click();
    await page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' }).click();
    await expect(page.locator('main .data-table')).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('#lead-filter')).toBeVisible();
    await expect(page.locator('#lead-filter')).toHaveValue('INTERESTED');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main .data-table tbody tr')).toHaveCount(1);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button', { name: /^Interested/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('on a phone a filtered URL survives reload, Back and Forward', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/leads?status=CONTACTED&view=table');
    await expect(page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button', { name: /^Contacted/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('main .data-table')).toContainText('Alpha Retail');
    await page.locator('main .data-table').getByRole('link', { name: 'Alpha Retail' }).click();
    await expect(page).toHaveURL(/\/leads\/lead-2$/);
    await page.goBack();
    await expect(page).toHaveURL(/status=CONTACTED/);
    await expect(page.locator('main .data-table')).toContainText('Alpha Retail');
    await page.goForward();
    await expect(page).toHaveURL(/\/leads\/lead-2$/);
  });
});

test.describe('Leads filters on tablet and desktop keep the Status dropdown', () => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    test(`${viewport.width}px: Status dropdown and the in-card view switch, no header switch`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/leads');
      await expect(page.locator('#lead-filter')).toBeVisible();
      await expect(page.locator('.leads-view--phone')).toBeHidden();
      await expect(page.locator('.toolbar--leads').getByRole('group', { name: 'Lead view' })).toBeVisible();
      await page.locator('#lead-filter').selectOption('NEW');
      await expect(page.locator('main .kanban-card')).toHaveCount(1);
      if (viewport.width >= 1181) {
        const tops = await Promise.all(['[aria-label="Lead scope"]', '#lead-search', '#lead-filter', '#lead-source-filter'].map(async (selector) => Math.round((await page.locator(selector).boundingBox())!.y)));
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(6);
      }
    });
  }
});
