import { expect, open, test } from './fixtures';

/*
  The way back from a detail page is the same everywhere: one link above the
  title, worded "Back to …", leading to the list. On a phone the post workflow
  is a one-line "Step X of Y" plus a compact row of every step.
*/
const DETAILS = [
  { path: '/posts/post-1', back: 'Back to posts', list: /\/posts$/ },
  { path: '/tasks/task-1', back: 'Back to tasks', list: /\/tasks$/ },
  { path: '/leads/lead-1', back: 'Back to leads', list: /\/leads$/ },
  { path: '/campaigns/campaign-1', back: 'Back to campaigns', list: /\/campaigns$/ },
  { path: '/content-plans/plan-1', back: 'Back to content plans', list: /\/content-plans$/ },
  { path: '/reports/report-1', back: 'Back to reports', list: /\/reports$/ },
] as const;

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 375, height: 812 }]) {
  test.describe(`detail page back link (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const { path, back, list } of DETAILS) {
      test(`${path}: "${back}" sits above the title and returns to the list`, async ({ page }) => {
        await open(page, path);
        const link = page.locator('main').getByRole('link', { name: back });
        await expect(link).toHaveCount(1);
        const title = page.locator('main h1').first();
        expect((await link.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(24);
        // The old wording and the old button are gone.
        await expect(page.locator('main').getByRole('link', { name: /^All (plans|reports|campaigns)$/ })).toHaveCount(0);

        await link.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(list);
      });
    }
  });
}

test.describe('post workflow stepper', () => {
  test('on a phone: one summary line, and every step in one compact row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/posts/post-1');
    await expect(page.locator('.workflow-stepper__summary')).toHaveText('Step 2 of 4: Client review. Waiting for client approval or changes.');
    const steps = page.locator('.workflow-stepper > li');
    await expect(steps).toHaveCount(4);
    const tops = new Set<number>();
    for (let index = 0; index < 4; index += 1) {
      const box = (await steps.nth(index).boundingBox())!;
      tops.add(Math.round(box.y));
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    expect(tops.size).toBe(1);
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');
    // Step descriptions are out of sight but still read out.
    await expect(steps.nth(0).locator('p')).toHaveText('Being prepared. Internal review runs as staged tasks.');
    expect((await steps.nth(0).locator('p').boundingBox())!.width).toBeLessThanOrEqual(1);
  });

  test('on desktop: the full steps with descriptions, and no summary line', async ({ page }) => {
    await open(page, '/posts/post-1');
    await expect(page.locator('.workflow-stepper__summary')).toBeHidden();
    await expect(page.locator('.workflow-stepper > li').nth(0).locator('p')).toBeVisible();
    await expect(page.locator('.workflow-stepper > li').nth(1)).toHaveAttribute('aria-current', 'step');
  });
});
