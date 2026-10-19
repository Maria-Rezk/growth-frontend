import { expect, open, test } from './fixtures';

test.describe('leads', () => {
  test('creating a lead validates the name, then adds it to the pipeline', async ({ page }) => {
    await open(page, '/leads');
    await page.getByRole('button', { name: 'New lead' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /create lead|save|add lead/i }).click();
    await expect(dialog.getByText('Lead name is required.')).toBeVisible();
    await expect(dialog.locator('#lead-name')).toBeFocused();

    await dialog.locator('#lead-name').fill('E2E Sample Prospect');
    await dialog.getByRole('button', { name: /create lead|save|add lead/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Lead created.')).toBeVisible();
    await expect(page.locator('main').getByText('E2E Sample Prospect')).toBeVisible();
  });

  test('changing a lead status records it in the history', async ({ page }) => {
    await open(page, '/leads/lead-2');
    await page.locator('#lead-status').selectOption('INTERESTED');
    await page.getByRole('button', { name: 'Update status' }).click();
    await expect(page.locator('main .badge', { hasText: 'Interested' }).first()).toBeVisible();
  });
});

test.describe('tasks', () => {
  test('a draft is saved privately, then published onto the board', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#task-title').fill('E2E draft task');
    await dialog.getByRole('checkbox', { name: 'Reels' }).check();
    await dialog.getByRole('checkbox', { name: 'Other' }).check();
    // OTHER needs its text: the form refuses until it is given.
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog.getByText('Say what the other type of work is.')).toBeVisible();
    await dialog.getByLabel('What kind of work is it?').fill('Event setup');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog).toBeHidden();

    // Not on the board while it is a draft.
    await expect(page.locator('.kanban-card', { hasText: 'E2E draft task' })).toHaveCount(0);

    await page.getByRole('button', { name: 'My drafts' }).click();
    const row = page.locator('.draft-row', { hasText: 'E2E draft task' });
    await expect(row.getByText('Event setup')).toBeVisible();
    await row.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('“E2E draft task” is now a task.')).toBeVisible();

    await page.getByRole('button', { name: 'All tasks' }).click();
    await expect(page.locator('.kanban-card', { hasText: 'E2E draft task' })).toBeVisible();
  });

  test('starting work stamps the start time and notifies', async ({ page }) => {
    await open(page, '/tasks/task-3');
    await page.locator('#task-status').selectOption('IN_PROGRESS');
    await expect(page.getByText('Task moved to In Progress.')).toBeVisible();
    await expect(page.locator('.key-values > div', { hasText: 'Started' })).toBeVisible();
  });

  test('editing a task replaces its types', async ({ page }) => {
    await open(page, '/tasks/task-3');
    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: 'Design' }).check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.key-values > div', { hasText: 'Type' }).getByText('Design')).toBeVisible();
  });
});

test.describe('approvals', () => {
  // Demo data lives in memory: a full reload resets it, so outcomes are checked in-app, never via page.goto.
  test('approving from the queue confirms and removes the task', async ({ page }) => {
    await open(page, '/approvals');
    const row = page.locator('main').getByText('Revise launch carousel CTA');
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await expect(page.getByText('Approved "Revise launch carousel CTA".')).toBeVisible();
    await expect(row).toBeHidden();
  });

  test('requesting changes cannot be sent without a note', async ({ page }) => {
    await open(page, '/approvals');
    await page.getByRole('button', { name: 'Request changes' }).first().click();
    const dialog = page.getByRole('dialog');
    const send = dialog.getByRole('button', { name: 'Send back' });
    await expect(send).toBeDisabled();
    await dialog.locator('textarea').fill('Make the CTA bigger.');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Sent back to /)).toBeVisible();
    await expect(page.locator('main').getByText('Revise launch carousel CTA')).toBeHidden();
  });
});

test.describe('notifications', () => {
  test('mark all read clears the unread count', async ({ page }) => {
    await open(page, '/notifications');
    await expect(page.getByRole('button', { name: /Notifications, \d+ unread/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  });

  test('a task notification opens its task', async ({ page }) => {
    await open(page, '/notifications');
    await page.locator('main').getByText('New task assigned').first().click();
    await expect(page).toHaveURL(/\/tasks\//);
  });
});

test.describe('automations', () => {
  test('pausing and resuming a rule gives feedback each way', async ({ page }) => {
    await open(page, '/automations');
    const toggle = page.locator('main').getByRole('switch').first();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.getByText(/is paused\./)).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(page.getByText(/is (on|active|resumed)/i)).toBeVisible();
    await expect(toggle).toBeChecked();
  });
});

test.describe('members', () => {
  test('roles open for editing on demand and suspending asks first', async ({ page }) => {
    await open(page, '/members');
    await expect(page.locator('.role-checklist')).toHaveCount(0);
    await page.getByRole('button', { name: 'Change roles for Demo Designer' }).click();
    await expect(page.locator('.role-checklist')).toHaveCount(1);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('row', { name: /Client Reviewer/ }).getByRole('button', { name: 'Suspend' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm.getByText(/lose access/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row', { name: /Client Reviewer/ }).getByText('Active')).toBeVisible();
  });
});
