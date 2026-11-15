import type { Locator, Page } from '@playwright/test';
import { expect, open, sidebar, test } from './fixtures';

/*
  The step flow (release guide 3.5, parallel-steps guide 1): a task whose
  people run as steps, one after another; the people on one step work side
  by side, and a step has at most one approver.

  Demo seed (the signed-in demo user is Demo User, a Super Admin):
  - task-1: step 1 Demo Designer, approved by Demo User, in review;
            step 2 Demo User, no approver, not reached.
  - task-4: step 1 Demo Designer (handed in) and Demo Copywriter (working)
            side by side, approved by Demo User; step 2 Demo User.

  Demo data lives in memory, so once a test changes it, it stays in-app
  (no page.goto).
*/

/** The steps, not the people listed inside each one. */
const steps = (page: Page): Locator => page.getByRole('list', { name: 'Steps' }).locator(':scope > li');
const stepBlock = (form: Locator, n: number): Locator => form.getByRole('listitem', { name: `Step ${n}`, exact: true });
const personOn = (form: Locator, step: number, person = 1) => form.getByLabel(`Person ${person} on step ${step}`, { exact: true });
const roleOn = (form: Locator, step: number, person = 1) => form.getByLabel(`Role of person ${person} on step ${step}`, { exact: true });
const approverOf = (form: Locator, step: number) => form.getByLabel(`Approver for step ${step}`, { exact: true });

async function newTaskForm(page: Page, title: string): Promise<Locator> {
  await open(page, '/tasks');
  await page.getByRole('button', { name: 'New task' }).click();
  const form = page.getByRole('dialog');
  await form.locator('#task-title').fill(title);
  return form;
}

test.describe('task step flow', () => {
  test('the task page shows the flow in order, with whose turn it is', async ({ page }) => {
    await open(page, '/tasks/task-1');
    const items = steps(page);
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Demo Designer');
    await expect(items.nth(0)).toContainText('With the approver');
    await expect(items.nth(0)).toContainText('Approved by Demo User');
    await expect(items.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(items.nth(1)).toContainText('Not reached');
    await expect(items.nth(1)).toContainText('No approver — done on submit');

    // A flow has no free status dropdown: only Cancel.
    await expect(page.locator('#task-status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel task' })).toBeVisible();
    // The next person cannot start: their step has not been reached.
    await expect(page.getByRole('button', { name: 'Start my part' })).toHaveCount(0);
  });

  test('approve the step, then the next person starts and finishes theirs', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await page.getByRole('button', { name: 'Approve step' }).click();
    await expect(page.getByText('Step approved. Demo User has been told it is their turn.')).toBeVisible();

    const items = steps(page);
    await expect(items.nth(0)).toContainText('Done');
    await expect(items.nth(1)).toContainText('Not started');
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'step');

    await page.getByRole('button', { name: 'Start my part' }).click();
    await expect(page.getByText('Your part has started. The clock is running.')).toBeVisible();
    await expect(items.nth(1)).toContainText('In progress');

    // No approver on the last step: submitting finishes it, and the task.
    await page.getByRole('button', { name: 'Mark my step done' }).click();
    await expect(page.getByText('Your part is in, and every step is done.')).toBeVisible();
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

  test('request changes sends a one-person step back to that person with the note', async ({ page }) => {
    await open(page, '/tasks/task-1');
    await page.getByRole('button', { name: 'Request changes' }).click();
    const dialog = page.getByRole('dialog');
    // One person on the step: no "Send back to" choice.
    await expect(dialog.getByRole('group', { name: 'Send back to' })).toHaveCount(0);
    await dialog.getByRole('textbox').fill('Make the CTA bigger.');
    await dialog.getByRole('button', { name: 'Send back' }).click();
    await expect(dialog).toBeHidden();
    await expect(steps(page).nth(0)).toContainText('In progress');
    await expect(steps(page).nth(0)).toContainText('Make the CTA bigger.');
    await expect(page.getByText('Changes requested on step 1')).toBeVisible();
  });

  test('a new task with steps sends them in order, with one approver per step', async ({ page }) => {
    const form = await newTaskForm(page, 'E2E flow task');

    // Without steps: one assignee and one approver.
    await expect(form.locator('#task-assignee')).toBeVisible();
    await form.getByRole('button', { name: 'Add steps' }).click();
    // With steps, approvers move onto each step.
    await expect(form.locator('#task-assignee')).toHaveCount(0);
    await expect(form.locator('#task-approver')).toHaveCount(0);

    await personOn(form, 1).selectOption('demo-designer');
    await approverOf(form, 1).selectOption('demo-user');
    await form.getByRole('button', { name: 'Add next step' }).click();
    await personOn(form, 2).selectOption('demo-user');
    await expect(roleOn(form, 2)).not.toHaveValue('');

    // Reorder: step 2 moves to the top, taking its people and approver with it.
    await form.getByRole('button', { name: 'Move step 2 up' }).click();
    await expect(personOn(form, 1)).toHaveValue('demo-user');
    await expect(approverOf(form, 2)).toHaveValue('demo-user');
    // The first step cannot move further up; focus moved to its other move button.
    await expect(form.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    await expect(form.getByRole('button', { name: 'Move step 1 down' })).toBeFocused();

    await form.getByRole('button', { name: 'Create task' }).click();
    await expect(form).toBeHidden();
    await page.getByRole('link', { name: /E2E flow task/ }).first().click();
    const items = steps(page);
    await expect(items.nth(0)).toContainText('Demo User');
    await expect(items.nth(0)).toContainText('Not started');
    await expect(items.nth(1)).toContainText('Demo Designer');
    await expect(items.nth(1)).toContainText('Approved by Demo User');
  });

  test('a step cannot be approved by somebody working on it', async ({ page }) => {
    const form = await newTaskForm(page, 'E2E self-approval check');
    await form.getByRole('button', { name: 'Add steps' }).click();
    await personOn(form, 1).selectOption('demo-user');
    await expect(approverOf(form, 1).locator('option[value="demo-user"]')).toHaveCount(0);
  });

  test('steps are internal: client contacts are offered neither as a person nor as an approver', async ({ page }) => {
    const form = await newTaskForm(page, 'E2E internal-only check');
    await form.getByRole('button', { name: 'Add steps' }).click();
    // demo-client is the seeded Client Reviewer on this client.
    await expect(personOn(form, 1).locator('option[value="demo-client"]')).toHaveCount(0);
    await expect(approverOf(form, 1).locator('option[value="demo-client"]')).toHaveCount(0);
    await expect(personOn(form, 1).locator('option[value="demo-designer"]')).toHaveCount(1);
  });
});

test.describe('parallel steps (people side by side)', () => {
  test('a shared step shows each person’s own status and "1 of 2 submitted"', async ({ page }) => {
    await open(page, '/tasks/task-4');
    const first = steps(page).nth(0);
    await expect(first).toContainText('1 of 2 submitted');
    await expect(first.locator('li', { hasText: 'Demo Designer' })).toContainText('Submitted · waiting for others');
    await expect(first.locator('li', { hasText: 'Demo Copywriter' })).toContainText('Working');
    await expect(first).toContainText('Approved by Demo User');
    // The approver is not asked yet: not everybody has handed in.
    await expect(page.getByRole('button', { name: 'Approve step' })).toHaveCount(0);
  });

  test('the last person in sends the step to its approver, who sends back only one person', async ({ page }) => {
    await open(page, '/tasks/task-4');
    // The demo user is an admin, not on step 1: they may hand in for the only person still working.
    await page.getByRole('button', { name: 'Hand in a part…' }).click();
    await expect(page.getByText('Everybody is in: sent to Demo User for review.')).toBeVisible();
    await expect(steps(page).nth(0)).toContainText('With the approver');

    await page.getByRole('button', { name: 'Request changes' }).click();
    const dialog = page.getByRole('dialog');
    const sendBackTo = dialog.getByRole('group', { name: 'Send back to' });
    // Everybody is ticked to start with; untick the designer.
    await expect(sendBackTo.getByRole('checkbox')).toHaveCount(2);
    await sendBackTo.getByRole('checkbox', { name: /Demo Designer/ }).uncheck();
    await dialog.getByRole('textbox', { name: 'What needs changing' }).fill('Tighten the voice-over.');
    await dialog.getByRole('button', { name: 'Send back' }).click();
    await expect(dialog).toBeHidden();

    const first = steps(page).nth(0);
    await expect(first.locator('li', { hasText: 'Demo Copywriter' })).toContainText('Working');
    await expect(first.locator('li', { hasText: 'Demo Copywriter' })).toContainText('Tighten the voice-over.');
    // The designer keeps their submission and waits.
    await expect(first.locator('li', { hasText: 'Demo Designer' })).toContainText('Submitted · waiting for others');
    // The banner above the task says who it went back to; the history says it too.
    await expect(page.locator('.review-note')).toContainText('sent back to Demo Copywriter');
    await expect(page.locator('.timeline__item', { hasText: 'Changes requested by Demo User' })).toContainText('Sent back to Demo Copywriter');
  });

  test('the form groups people into a step, and an admin picks whose part to start', async ({ page }) => {
    const form = await newTaskForm(page, 'E2E side by side');
    await form.getByRole('button', { name: 'Add steps' }).click();
    await personOn(form, 1).selectOption('demo-designer');
    await stepBlock(form, 1).getByRole('button', { name: 'Add person to this step' }).click();
    await personOn(form, 1, 2).selectOption('demo-copywriter');
    // Somebody already on the step cannot be picked twice for it.
    await expect(personOn(form, 1, 2).locator('option[value="demo-designer"]')).toBeDisabled();
    await approverOf(form, 1).selectOption('demo-user');
    await expect(approverOf(form, 1).locator('option[value=""]')).toHaveText('No approver — done when everybody submits');
    await form.getByRole('button', { name: 'Create task' }).click();
    await expect(form).toBeHidden();

    await page.getByRole('link', { name: /E2E side by side/ }).first().click();
    const first = steps(page).nth(0);
    await expect(first.locator('li')).toHaveCount(2);
    await expect(first).toContainText('0 of 2 submitted');

    // Both could start: the API asks whose part (409 STEP_ASSIGNEE_REQUIRED).
    await page.getByRole('button', { name: 'Start a part…' }).click();
    const picker = page.getByRole('dialog', { name: 'Start whose part?' });
    await picker.getByRole('radio', { name: 'Demo Copywriter' }).check();
    await picker.getByRole('button', { name: 'Start for Demo Copywriter' }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByText('Demo Copywriter\'s part has started.')).toBeVisible();
    await expect(first.locator('li', { hasText: 'Demo Copywriter' })).toContainText('Working');
    await expect(first.locator('li', { hasText: 'Demo Designer' })).toContainText('Their turn');
  });

  test('history names who handed in and who was sent back', async ({ page }) => {
    await open(page, '/tasks/task-4');
    await page.getByRole('button', { name: 'Hand in a part…' }).click();
    await expect(page.getByText('Everybody is in: sent to Demo User for review.')).toBeVisible();
    const titles = page.locator('.timeline__title');
    await expect(titles.filter({ hasText: 'Demo Copywriter handed in their part on step 1' })).toHaveCount(1);
    await expect(titles.filter({ hasText: 'Step 1 submitted for review' })).toHaveCount(1);
  });
});
