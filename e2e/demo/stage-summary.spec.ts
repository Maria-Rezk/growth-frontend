import { expect, open, test } from './fixtures';

/*
  The stage tiles above the Leads pipeline and the Posts board. Seven stages
  never divide into an auto-fit grid: between ~760 and ~1300px they wrapped
  5 + 2 and left three empty bordered cells. They are one row of equal
  columns from tablet up, and wrapping chips on phones.
*/
const PAGES = [
  { path: '/leads', group: 'Filter by pipeline stage' },
  { path: '/posts', group: 'Filter by workflow stage' },
] as const;

for (const { path, group } of PAGES) {
  test.describe(`${path} stage tiles`, () => {
    for (const width of [768, 800, 1024, 1440, 1920]) {
      test(`one row, no empty cell, counts aligned at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await open(page, path);
        const container = page.getByRole('group', { name: group });
        const tiles = container.getByRole('button');
        await expect(tiles).toHaveCount(7);

        const boxes = await tiles.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect));
        expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
        // The tiles fill the row edge to edge: nothing left over for an empty cell.
        const inner = await container.evaluate((element) => element.clientWidth);
        const covered = boxes.reduce((sum, box) => sum + box.width, 0);
        expect(Math.abs(covered - inner)).toBeLessThanOrEqual(1);

        const counts = await container.locator('strong').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
        expect(new Set(counts).size).toBe(1);
      });
    }

    for (const width of [320, 375]) {
      test(`wrapping chips with every stage visible at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 812 });
        await open(page, path);
        const tiles = page.getByRole('group', { name: group }).getByRole('button');
        await expect(tiles).toHaveCount(7);
        for (let index = 0; index < 7; index += 1) {
          const box = (await tiles.nth(index).boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.height).toBeGreaterThanOrEqual(24);
          expect(box.height).toBeLessThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      });
    }
  });
}

test('a Posts stage tile still filters the board', async ({ page }) => {
  await open(page, '/posts');
  const draft = page.getByRole('group', { name: 'Filter by workflow stage' }).getByRole('button', { name: /^Draft/ });
  await draft.click();
  await expect(draft).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/status=DRAFT/);
});
