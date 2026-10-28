import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  One convention for required and optional fields, read from the rendered
  forms: an optional field says "(optional)" in its label; a required field
  carries aria-required and no visual marker; a form whose fields are all
  required shows no "(optional)" at all. Every control has a label.
*/

type FieldState = { label: string; optional: boolean; required: boolean };

/** Each labelled control in `scope`: its label text and how it is marked. */
async function fieldStates(scope: Locator): Promise<FieldState[]> {
  return scope.evaluate((root) => [...root.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea')]
    .filter((control) => control.getBoundingClientRect().width > 0)
    .map((control) => {
      const label = control.id ? root.querySelector(`label[for="${control.id}"]`) : null;
      const text = (label?.textContent ?? '').trim();
      return {
        label: text.replace(/\s*\(optional\)$/, ''),
        optional: /\(optional\)$/.test(text),
        required: control.getAttribute('aria-required') === 'true' || control.hasAttribute('required'),
      };
    }));
}

async function expectMarks(scope: Locator, required: string[], optional: string[]) {
  const states = await fieldStates(scope);
  const byLabel = new Map(states.map((state) => [state.label, state]));
  for (const name of required) {
    expect(byLabel.get(name), `"${name}" is in the form`).toBeDefined();
    expect(byLabel.get(name), `"${name}" is required`).toMatchObject({ required: true, optional: false });
  }
  for (const name of optional) {
    expect(byLabel.get(name), `"${name}" is in the form`).toBeDefined();
    expect(byLabel.get(name), `"${name}" is optional`).toMatchObject({ required: false, optional: true });
  }
  // Nothing unlabelled, and nothing both or neither in a mixed form.
  for (const state of states) expect(state.label, 'every control has a label').not.toBe('');
}

async function openDialog(page: Page, path: string, opener: string, title: string) {
  await open(page, path);
  await page.locator('main').getByRole('button', { name: opener, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('required and optional fields', () => {
  test('Create lead', async ({ page }) => {
    const dialog = await openDialog(page, '/leads', 'New lead', 'Create lead');
    await expectMarks(dialog, ['Name', 'Source'], ['Email', 'Phone', 'Next follow-up', 'Interested service', 'Assigned to', 'Notes']);
    // What is required, and its message, did not change.
    await dialog.getByRole('button', { name: 'Create lead' }).click();
    await expect(dialog.getByText('Lead name is required.')).toBeVisible();
  });

  test('Create content draft', async ({ page }) => {
    const dialog = await openDialog(page, '/posts', 'New post', 'Create content draft');
    await expectMarks(dialog, ['Title', 'Platform', 'Content type'], ['Content plan', 'Caption', 'Visual brief', 'Schedule date']);
  });

  test('Create campaign', async ({ page }) => {
    const dialog = await openDialog(page, '/campaigns', 'New campaign', 'Create campaign');
    await expectMarks(dialog, ['Name', 'Objective'], ['Currency', 'Description', 'Start date', 'End date', 'Budget', 'Target audience', 'Notes']);
  });

  test('Create task, including its grouped fields', async ({ page }) => {
    const dialog = await openDialog(page, '/tasks', 'New task', 'Create task');
    await expectMarks(dialog, ['Title', 'Priority'], ['Description', 'Responsibility area', 'Due date']);
    await expect(dialog.locator('legend', { hasText: 'Type' })).toContainText('(optional)');
    await expect(dialog.locator('legend', { hasText: 'People on this task' })).toContainText('(optional)');
    // The old wording, "Optional." inside the hint, is gone.
    await expect(dialog.getByText(/^Optional\./)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await expect(dialog.getByText('Task title is required.')).toBeVisible();
  });

  test('Add client', async ({ page }) => {
    const dialog = await openDialog(page, '/admin/clients', 'Add client', 'Add client');
    await expectMarks(dialog, ['Client name'], ['Industry', 'Website', 'Phone', 'City', 'Country']);
  });

  test('a form whose fields are all required shows no "(optional)": New content plan', async ({ page }) => {
    const dialog = await openDialog(page, '/content-plans', 'New plan', 'Create content plan');
    await expect(dialog.getByText('(optional)')).toHaveCount(0);
    for (const state of await fieldStates(dialog)) expect(state.required, `"${state.label}" is required`).toBe(true);
  });

  test('sign in: both fields required, no markers', async ({ page }) => {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Logout' }).click();
    const form = page.locator('main form');
    await expect(form.getByText('(optional)')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-required', 'true');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-required', 'true');
  });
});
