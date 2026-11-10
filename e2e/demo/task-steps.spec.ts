import type { Locator, Page } from '@playwright/test';
import { expect, open, sidebar, test } from './fixtures';

/*
  The step flow (release guide 3.5): a task whose people are an ordered list
  of steps, each with an optional approver of its own.

  Demo seed: task-1 is a two-step flow — step 1 Demo Designer (Designer),
  approved by Demo User, waiting in review; step 2 Demo User (Account
  Manager), no approver, not reached. The signed-in demo user is Demo User.

  Demo data lives in memory, so once a test changes it, it stays in-app
  (no page.goto).
*/

const steps = (page: Page): Locator => page.getByRole('list', { name: 'Steps' });

test.describe('task step flow', () => {
  test('the task page shows the flow in order, with whose turn it is', async ({ page }) => {
    await open(page, '/tasks/task-1');
    const items = steps(page).getByRole('listitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Demo Designer');
    await expect(items.nth(0)).toContainText('In review');
    await expect(items.nth(0)).toContainText('Approved by Demo User');
    await expect(items.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(items.nth(1)).toContainText('Not reached');
    await expect(items.nth(1)).toContainText('No approver — done on submit');

    // A flow has no free status dropdown: only Cancel.
    await expect(page.locator('#task-status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel task' })).toBeVisible();
    // The next person cannot start: their step has not been reached.
    await expect(page.getByRole('button', { name: 'Start my step' })).toHaveCount(0);
  });

  test('approve the step, then the next person starts and finishes theirs', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await page.getByRole('button', { name: 'Approve step' }).click();
    await expect(page.getByText('Step approved. Demo User has been told it is their turn.')).toBeVisible();

    const items = steps(page).getByRole('listitem');
    await expect(items.nth(0)).toContainText('Done');
    await expect(items.nth(1)).toContainText('Their turn');
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'step');

    await page.getByRole('button', { name: 'Start my step' }).click();
    await expect(page.getByText('Your step has started. The clock is running.')).toBeVisible();
    await expect(items.nth(1)).toContainText('Working');

    // No approver on the last step: submitting finishes it, and the task.
    await page.getByRole('button', { name: 'Mark my step done' }).click();
    await expect(page.getByText('Your step is done, and so is the task.')).toBeVisible();
    await expect(items.nth(1)).toContainText('Done');
    await expect(page.getByText('Every step is done', { exact: false }).first()).toBeVisible();
  });

  test('My work lists a flow only once the step reaches you, with that step’s actions', async ({ page }) => {
    await open(page, '/my-work');
    // Step 2 is the demo user's but not reached: task-1 is not in their list.
    await expect(page.locator('main').getByText('Revise launch carousel CTA')).toHaveCount(0);

    await sidebar(page).getByRole('link', { name: 'Tasks' }).click();
    await page.getByRole('link', { name: /Revise launch carousel CTA/ }).first().click();
    await page.getByRole('button', { name: 'Approve step' }).click();
    await expect(page.getByText('Step approved.', { exact: false })).toBeVisible();

    await sidebar(page).getByRole('link', { name: 'My work' }).click();
    const row = page.locator('.work-row', { hasText: 'Revise launch carousel CTA' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Mark step done' })).toBeVisible();
    // No free status change on a flow.
    await expect(row.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
  });

  test('request changes sends the step back to the same person with the note', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await page.getByRole('button', { name: 'Request changes' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Make the CTA bigger.');
    await dialog.getByRole('button', { name: /request changes|send back/i }).click();
    await expect(dialog).toBeHidden();
    await expect(steps(page).getByRole('listitem').nth(0)).toContainText('Working');
    await expect(steps(page).getByRole('listitem').nth(0)).toContainText('Make the CTA bigger.');
    await expect(page.getByText('Changes requested on step 1')).toBeVisible();
  });

  test('a new task with steps sends them in order, with per-step approvers', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const form = page.getByRole('dialog');
    await form.locator('#task-title').fill('E2E flow task');

    // Without steps: one assignee and one approver.
    await expect(form.locator('#task-assignee')).toBeVisible();
    await form.getByRole('button', { name: 'Add steps' }).click();
    // With steps, approvers move onto each step.
    await expect(form.locator('#task-assignee')).toHaveCount(0);
    await expect(form.locator('#task-approver')).toHaveCount(0);

    await form.getByLabel('Person for step 1', { exact: true }).selectOption('demo-designer');
    await form.getByLabel('Approver for step 1', { exact: true }).selectOption('demo-user');
    await form.getByRole('button', { name: 'Add step' }).click();
    await form.getByLabel('Person for step 2', { exact: true }).selectOption('demo-user');
    await expect(form.getByLabel('Role for step 2', { exact: true })).not.toHaveValue('');

    // Reorder: the second row moves to the top.
    await form.getByRole('button', { name: 'Move Demo User up' }).click();
    await expect(form.getByLabel('Person for step 1', { exact: true })).toHaveValue('demo-user');
    await expect(form.getByLabel('Approver for step 2', { exact: true })).toHaveValue('demo-user');
    // The first row cannot move further up.
    await expect(form.getByRole('button', { name: 'Move Demo User up' })).toBeDisabled();

    await form.getByRole('button', { name: 'Create task' }).click();
    await expect(form).toBeHidden();
    await page.getByRole('link', { name: /E2E flow task/ }).first().click();
    const items = steps(page).getByRole('listitem');
    await expect(items.nth(0)).toContainText('Demo User');
    await expect(items.nth(0)).toContainText('Their turn');
    await expect(items.nth(1)).toContainText('Demo Designer');
    await expect(items.nth(1)).toContainText('Approved by Demo User');
  });

  test('a step cannot be approved by its own person', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const form = page.getByRole('dialog');
    await form.locator('#task-title').fill('E2E self-approval check');
    await form.getByRole('button', { name: 'Add steps' }).click();
    await form.getByLabel('Person for step 1', { exact: true }).selectOption('demo-user');
    // The approver list leaves the step's own person out.
    await expect(form.getByLabel('Approver for step 1', { exact: true }).locator('option[value="demo-user"]')).toHaveCount(0);
  });

  test('steps are internal: client contacts are offered neither as a step’s person nor as its approver', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const form = page.getByRole('dialog');
    await form.locator('#task-title').fill('E2E internal-only check');
    await form.getByRole('button', { name: 'Add steps' }).click();
    // demo-client is the seeded Client Reviewer on this client.
    await expect(form.getByLabel('Person for step 1', { exact: true }).locator('option[value="demo-client"]')).toHaveCount(0);
    await expect(form.getByLabel('Approver for step 1', { exact: true }).locator('option[value="demo-client"]')).toHaveCount(0);
    await expect(form.getByLabel('Person for step 1', { exact: true }).locator('option[value="demo-designer"]')).toHaveCount(1);
  });
});
