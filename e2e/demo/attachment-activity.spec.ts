import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  Task activity names the attachment it is about. The API now captures the
  name in the row when it happens (`originalName`, `label`; parallel-steps
  guide 3), so it survives the attachment's removal. Older rows carry no name
  and fall back to the kind. A URL or a note's text is never shown.

  Demo seed for task-1: a file row for attachment-2 with its name, an older
  row for a link since deleted (no name, only an address), and a row with no
  metadata at all. Demo data lives in memory, so the test stays in-app after
  it changes anything.
*/

const activity = (page: Page) => page.locator('.card', { has: page.getByRole('heading', { name: 'Activity' }) }).locator('.timeline__title');
const linkForm = (page: Page) => page.getByRole('group', { name: 'Add a link or a note' });

test.describe('task activity names attachments', () => {
  test('seeded rows: a file by name, an older deleted link by kind, an old row as "Attachment added"', async ({ page }) => {
    await open(page, '/tasks/task-1');
    const titles = activity(page);
    await expect(titles.filter({ hasText: 'Attachment added: approval-flow-wireframe.pdf' })).toHaveCount(1);
    await expect(titles.filter({ hasText: /^Link added$/ })).toHaveCount(1);
    await expect(titles.filter({ hasText: /^Attachment added$/ })).toHaveCount(1);
    // The deleted link's address is never shown.
    await expect(page.locator('.timeline')).not.toContainText('drive.example.com');
  });

  test('adding a labelled link and a note names them; removing one says what went', async ({ page }) => {
    await open(page, '/tasks/task-1');
    const form = linkForm(page);

    await form.getByLabel('Link', { exact: true }).fill('https://drive.example.com/private/references?token=abc');
    await form.getByLabel('Label').fill('Design References');
    await form.getByRole('button', { name: 'Add link' }).click();
    await expect(activity(page).filter({ hasText: 'Link added: Design References' })).toHaveCount(1);

    await form.getByRole('button', { name: 'Note' }).click();
    await form.getByLabel('Note', { exact: true }).fill('Private feedback: make the logo bigger');
    await form.getByLabel('Label').fill('Client Feedback');
    await form.getByRole('button', { name: 'Add note' }).click();
    await expect(activity(page).filter({ hasText: 'Text attachment added: Client Feedback' })).toHaveCount(1);

    // Neither the URL nor the note's text reaches the activity.
    await expect(page.locator('.timeline')).not.toContainText('token=abc');
    await expect(page.locator('.timeline')).not.toContainText('make the logo bigger');

    // An unlabelled link says what it was, without its address.
    await form.getByRole('button', { name: 'Link' }).click();
    await form.getByLabel('Link', { exact: true }).fill('https://example.com/moodboard');
    await form.getByRole('button', { name: 'Add link' }).click();
    await expect(activity(page).filter({ hasText: /^Link added$/ })).toHaveCount(2);

    // Removed: the name was captured when it happened, so both rows still say which link.
    await page.getByRole('button', { name: 'Remove Design References' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(activity(page).filter({ hasText: 'Link removed: Design References' })).toHaveCount(1);
    await expect(activity(page).filter({ hasText: 'Link added: Design References' })).toHaveCount(1);
    await expect(page.locator('.timeline')).not.toContainText('token=abc');
  });
});
