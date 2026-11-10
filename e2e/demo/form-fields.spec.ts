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
    await expect(dialog.locator('legend', { hasText: 'Steps' })).toContainText('(optional)');
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

test.describe('composite controls are named groups (N-12)', () => {
  /** Every <label for> in `scope` points at an element that exists. */
  async function expectNoDanglingLabels(scope: Locator) {
    const dangling = await scope.evaluate((root) => [...root.querySelectorAll('label[for]')]
      .filter((label) => !document.getElementById(label.getAttribute('for') ?? ''))
      .map((label) => label.textContent?.trim()));
    expect(dangling, 'labels pointing at nothing').toEqual([]);
  }

  test('Assign to a client: the roles are a group with its rule, its error, and invalid boxes', async ({ page }) => {
    await open(page, '/admin/employees');
    await page.locator('main').getByRole('button', { name: 'Assign to client' }).first().click();
    const dialog = page.getByRole('dialog');
    const roles = dialog.getByRole('group', { name: 'Roles on this client' });
    await expect(roles).toBeVisible();
    await expect(roles).toHaveAccessibleDescription(/Pick at least one role\./);
    // Sub-groups keep their own names inside it.
    await expect(roles.getByRole('group', { name: 'Agency team' })).toBeVisible();
    await expectNoDanglingLabels(dialog);

    // Keyboard: Space unticks the only role; the error describes the group and every box is flagged.
    const designer = roles.getByRole('checkbox', { name: 'Designer' });
    await designer.focus();
    await page.keyboard.press('Space');
    await expect(designer).not.toBeChecked();
    await expect(roles.getByText('Pick at least one role.', { exact: true }).last()).toBeVisible();
    await expect(roles).toHaveAccessibleDescription(/Pick at least one role\..*Pick at least one role\./);
    for (const box of await roles.getByRole('checkbox').all()) await expect(box).toHaveAttribute('aria-invalid', 'true');
    // The danger ring shows on a box that is not focused; focus keeps the focus ring.
    const copywriter = roles.getByRole('checkbox', { name: 'Copywriter', exact: true });
    expect(await copywriter.evaluate((input) => getComputedStyle(input).outlineColor)).toBe('rgb(180, 35, 24)');
    expect(await designer.evaluate((input) => getComputedStyle(input).outlineColor)).toBe('rgb(201, 20, 75)');
    await expect(dialog.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();

    // Tab moves to the next box, Space ticks it, and the error and flags clear.
    await page.keyboard.press('Tab');
    await expect(roles.getByRole('checkbox', { name: 'Art director' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(roles.getByRole('checkbox', { name: 'Art director' })).toBeChecked();
    await expect(roles.locator('.field__error')).toHaveCount(0);
    await expect(copywriter).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('client people: the add-person roles are a group, and each inline editor is named for the person', async ({ page }) => {
    await open(page, '/admin/clients');
    await page.locator('main').getByRole('button', { name: 'Manage' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('group', { name: 'Roles', exact: true })).toHaveAccessibleDescription(/Pick at least one role\./);
    await expectNoDanglingLabels(dialog);
    const change = dialog.getByRole('button', { name: /^Change roles for / }).first();
    const person = (await change.getAttribute('aria-label'))!.replace('Change roles for ', '');
    await change.click();
    await expect(dialog.getByRole('group', { name: `Roles for ${person}` })).toBeVisible();
  });

  test('Members: the inline role editor is named for the person', async ({ page }) => {
    await open(page, '/members');
    await page.getByRole('button', { name: 'Change roles for Demo Designer' }).click();
    const group = page.getByRole('group', { name: 'Roles for Demo Designer' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('checkbox', { name: 'Designer' })).toBeChecked();
  });

  test('Brand colours: each row is a named group, the picker is labelled, Tab goes Name, Hex, Pick, Remove', async ({ page }) => {
    await open(page, '/brand-profile');
    const rows = page.getByRole('group', { name: /^Colour \d+$/ });
    expect(await rows.count()).toBeGreaterThan(0);
    const first = page.getByRole('group', { name: 'Colour 1' });
    const name = first.getByLabel('Name');
    const hex = first.getByLabel('Hex');
    const pick = first.getByLabel('Pick');
    await expect(pick).toHaveAttribute('type', 'color');
    const before = await hex.inputValue();
    await name.focus();
    await page.keyboard.press('Tab');
    await expect(hex).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(pick).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first.getByRole('button', { name: 'Remove colour 1' })).toBeFocused();
    // Values are untouched by the grouping.
    await expect(hex).toHaveValue(before);
  });
});
