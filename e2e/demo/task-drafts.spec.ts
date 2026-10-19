import type { Locator, Page } from '@playwright/test';
import { expect, open, sidebar, test } from './fixtures';

/*
  The task draft lifecycle, end to end: create → save draft → reopen in the
  SAME form → edit → save again → reopen → publish.

  Persistence contract: a draft is a real task with `isDraft: true` on the
  server (POST /tasks, PATCH /tasks/:id, POST /tasks/:id/publish-draft). In
  demo mode that server is an in-memory store, so it survives in-app
  navigation but not a full page reload; these tests therefore navigate with
  the sidebar, never `page.goto`, once a draft exists.
*/

const DRAFT = {
  title: 'E2E lifecycle draft',
  description: 'Brief from the client call',
  due: '2026-11-05T10:30',
};

function dialog(page: Page): Locator {
  return page.getByRole('dialog');
}

async function openMyDrafts(page: Page) {
  await page.getByRole('button', { name: 'My drafts' }).click();
}

async function createDraft(page: Page) {
  await open(page, '/tasks');
  await page.getByRole('button', { name: 'New task' }).click();
  const form = dialog(page);
  await form.locator('#task-title').fill(DRAFT.title);
  await form.locator('#task-description').fill(DRAFT.description);
  await form.getByRole('checkbox', { name: 'Reels' }).check();
  await form.locator('#task-priority').selectOption('HIGH');
  // Assignee options carry the role too (one person can be listed under each of theirs).
  await form.locator('#task-assignee').selectOption('demo-designer::DESIGNER');
  await form.locator('#due').fill(DRAFT.due);
  await form.locator('#task-approver').selectOption('demo-designer');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText('Draft saved. Find it under My drafts.')).toBeVisible();
}

async function reopen(page: Page, title: string) {
  await page.locator('.draft-row__title', { hasText: title }).click();
  const form = dialog(page);
  await expect(form.getByRole('heading', { name: 'Edit draft' })).toBeVisible();
  return form;
}

test.describe('task drafts', () => {
  test('a saved draft reopens in the same form with every value restored', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);

    // Same form as creation: same fields, same controls.
    await expect(form.locator('#task-title')).toHaveValue(DRAFT.title);
    await expect(form.locator('#task-description')).toHaveValue(DRAFT.description);
    await expect(form.getByRole('checkbox', { name: 'Reels' })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: 'Design' })).not.toBeChecked();
    await expect(form.locator('#task-priority')).toHaveValue('HIGH');
    await expect(form.locator('#task-assignee')).toHaveValue(/^demo-designer::/);
    await expect(form.locator('#task-approver')).toHaveValue('demo-designer');
    await expect(form.locator('#due')).toHaveValue(DRAFT.due);
    await expect(form.locator('#task-area')).toBeVisible();
    await expect(form.getByText('Attachments', { exact: true })).toBeVisible();

    // Draft actions, not creation ones.
    await expect(form.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Publish task' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Create task' })).toHaveCount(0);
  });

  test('edits save to the same draft, persist, and create no duplicate', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    let form = await reopen(page, DRAFT.title);

    await form.locator('#task-title').fill(`${DRAFT.title} v2`);
    await form.locator('#task-description').fill('Updated brief');
    await form.getByRole('checkbox', { name: 'Design' }).check();
    await form.locator('#task-priority').selectOption('URGENT');
    await form.getByRole('button', { name: 'Save draft' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();

    // Exactly one draft, carrying the new title.
    await expect(page.locator('.draft-row')).toHaveCount(1);
    await expect(page.locator('.draft-row__title')).toHaveText(`${DRAFT.title} v2`);

    form = await reopen(page, `${DRAFT.title} v2`);
    await expect(form.locator('#task-description')).toHaveValue('Updated brief');
    await expect(form.getByRole('checkbox', { name: 'Design' })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: 'Reels' })).toBeChecked();
    await expect(form.locator('#task-priority')).toHaveValue('URGENT');
    // Saved twice, still the time that was typed (no time-zone drift).
    await expect(form.locator('#due')).toHaveValue(DRAFT.due);
    // Untouched fields kept their saved values.
    await expect(form.locator('#task-approver')).toHaveValue('demo-designer');
  });

  test('a draft survives navigating away and back', async ({ page }) => {
    await createDraft(page);
    await sidebar(page).getByRole('link', { name: 'Leads CRM' }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await sidebar(page).getByRole('link', { name: 'Tasks' }).click();
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);
    await expect(form.locator('#task-title')).toHaveValue(DRAFT.title);
  });

  test('validation blocks bad edits and keeps the draft unchanged', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);

    await form.locator('#task-title').fill('');
    await form.getByRole('button', { name: 'Save draft' }).click();
    await expect(form.getByText('Task title is required.')).toBeVisible();

    await form.locator('#task-title').fill(DRAFT.title);
    await form.getByRole('checkbox', { name: 'Reels' }).uncheck();
    await form.getByRole('button', { name: 'Save draft' }).click();
    // The API cannot clear a task's types once set.
    await expect(form.getByText('Keep at least one type.')).toBeVisible();

    await form.getByRole('checkbox', { name: 'Other' }).check();
    await form.getByRole('button', { name: 'Save draft' }).click();
    await expect(form.getByText('Say what the other type of work is.')).toBeVisible();
    await expect(form).toBeVisible();
  });

  test('closing with unsaved edits asks first; keeping edits keeps them, discarding keeps the saved draft', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);
    await form.locator('#task-title').fill('Typed but not saved');

    await form.getByRole('button', { name: 'Cancel' }).click();
    const confirm = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('dialog').locator('#task-title')).toHaveValue('Typed but not saved');

    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const reopened = await reopen(page, DRAFT.title);
    await expect(reopened.locator('#task-title')).toHaveValue(DRAFT.title);
  });

  test('a reload with unsaved edits is guarded by the browser prompt', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);
    await form.locator('#task-title').fill('Unsaved');
    const prompted = page.waitForEvent('dialog').then((prompt) => {
      const type = prompt.type();
      void prompt.dismiss();
      return type;
    });
    void page.reload().catch(() => undefined);
    expect(await prompted).toBe('beforeunload');
  });

  test('Publish saves the edits, issues the task and removes it from drafts', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);
    await form.locator('#task-title').fill(`${DRAFT.title} final`);
    await form.getByRole('button', { name: 'Publish task' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByText('Published. The assignee has been told.')).toBeVisible();
    await expect(page.locator('.draft-row')).toHaveCount(0);

    await page.getByRole('button', { name: 'All tasks' }).click();
    await expect(page.locator('.kanban-card', { hasText: `${DRAFT.title} final` })).toBeVisible();
  });

  test('the draft page opens the same form, and a published task edits there too', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    await page.locator('.draft-row__title', { hasText: DRAFT.title }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();

    // The board card for a published task opens its page; its Edit uses the same form.
    await page.getByRole('button', { name: 'All tasks' }).click();
    await page.locator('.kanban-card', { hasText: 'Prepare monthly report notes' }).click();
    await expect(page).toHaveURL(/\/tasks\/task-3$/);
    await page.getByRole('button', { name: 'Edit' }).click();
    const form = dialog(page);
    await expect(form.getByRole('heading', { name: 'Edit task' })).toBeVisible();
    await expect(form.locator('#task-title')).toHaveValue('Prepare monthly report notes');
    await expect(form.locator('#task-area')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  });
});

test.describe('task drafts on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the edit form fits the screen and its actions are reachable', async ({ page }) => {
    await createDraft(page);
    await openMyDrafts(page);
    const form = await reopen(page, DRAFT.title);
    const box = await form.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await expect(form.getByRole('button', { name: 'Publish task' })).toBeInViewport();
    await expect(form.locator('#task-title')).toHaveValue(DRAFT.title);
  });
});
