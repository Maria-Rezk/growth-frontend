import { expect, open, sidebar, test } from './fixtures';

/*
  Notifications name who acted and who has the task now, beside the task's
  live status (parallel-steps guide 2). The message keeps what was true when
  it was written; the task line shows how the task stands today.

  Demo seed: notification-1 is about task-1, which is in review.
*/

const items = (page: import('@playwright/test').Page) => page.locator('main article.notification-item');

test.describe('notification people', () => {
  test('a task notification shows the task as it is now', async ({ page }) => {
    await open(page, '/notifications');
    const item = items(page).filter({ hasText: 'Revise launch carousel CTA was assigned' });
    await expect(item.locator('.notification-item__task')).toContainText('Revise launch carousel CTA');
    await expect(item.locator('.notification-item__task')).toContainText('In Review');
    // In review: it is with the approver, so nobody is named as working on it.
    await expect(item.locator('.notification-item__people')).toHaveCount(0);
  });

  test('a step reached names who caused it and who has the task now', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await page.getByRole('button', { name: 'Approve step' }).click();
    await expect(page.getByText('Step approved.', { exact: false })).toBeVisible();

    await sidebar(page).getByRole('link', { name: 'Notifications' }).click();
    const reached = items(page).filter({ hasText: 'Your turn on a task' }).first();
    await expect(reached).toContainText('step 2 of 2');
    await expect(reached.locator('.notification-item__task')).toContainText('Todo');
    await expect(reached.locator('.notification-item__people')).toHaveText('By Demo User · Now with Demo User');
  });

  test('a notification that is not about a task shows no task line', async ({ page }) => {
    await open(page, '/notifications');
    const lead = items(page).filter({ hasText: 'Nour Clinic moved to Interested' });
    await expect(lead).toBeVisible();
    await expect(lead.locator('.notification-item__task')).toHaveCount(0);
  });
});
