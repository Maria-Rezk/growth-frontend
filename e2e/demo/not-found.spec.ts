import { expect, test } from './fixtures';

/*
  A deleted record or a wrong link is not an error to retry. Each detail page
  answers at once with a real heading, a tab title and the way back to its list.
*/
const MISSING: ReadonlyArray<{ path: string; heading: string; back: string; list: RegExp }> = [
  { path: '/tasks/missing', heading: 'Task not found', back: 'Back to tasks', list: /\/tasks$/ },
  { path: '/posts/missing', heading: 'Post not found', back: 'Back to posts', list: /\/posts$/ },
  { path: '/leads/missing', heading: 'Lead not found', back: 'Back to leads', list: /\/leads$/ },
  { path: '/campaigns/missing', heading: 'Campaign not found', back: 'Back to campaigns', list: /\/campaigns$/ },
  { path: '/content-plans/missing', heading: 'Content plan not found', back: 'Back to content plans', list: /\/content-plans$/ },
  { path: '/reports/missing', heading: 'Report not found', back: 'Back to reports', list: /\/reports$/ },
];

test.describe('missing records', () => {
  for (const { path, heading, back, list } of MISSING) {
    test(`${path} says it is not found and links back`, async ({ page }) => {
      await page.goto(path);
      // Well under React Query's retry backoff: a 404 is answered, not retried.
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 2_500 });
      await expect(page).toHaveTitle(new RegExp(`^${heading} · `));
      await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);

      await page.getByRole('link', { name: back }).click();
      await expect(page).toHaveURL(list);
    });
  }
});
