import { expect, open, test } from './fixtures';

/*
  Where focus goes when a dialog opens and closes. A dialog opens on its first
  field (never on the Close button), and closing hands focus back to whatever
  opened it, so a keyboard user carries on from where they were.
*/
const FORMS = [
  { path: '/tasks', opener: 'New task', title: 'Create task', field: '#task-title' },
  { path: '/admin/clients', opener: 'Add client', title: 'Add client', field: '#client-name' },
  { path: '/admin/employees', opener: 'Add employee', title: 'Add employee', field: '#employee-name' },
] as const;

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 375, height: 812 }]) {
  test.describe(`dialog focus (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const { path, opener, title, field } of FORMS) {
      test(`${title} opens on its first field and returns focus to "${opener}"`, async ({ page }) => {
        await open(page, path);
        const trigger = page.locator('main').getByRole('button', { name: opener, exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: title });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(field)).toBeFocused();
        await expect(dialog.getByRole('button', { name: 'Close dialog' })).not.toBeFocused();

        // Typing goes straight into the field.
        await page.keyboard.type('Typed');
        await expect(dialog.locator(field)).toHaveValue('Typed');

        // The form is dirty now, so Escape asks first; Discard closes it.
        await page.keyboard.press('Escape');
        const confirm = page.getByRole('dialog', { name: 'Discard changes?' });
        await expect(confirm).toBeVisible();
        await confirm.getByRole('button', { name: 'Discard' }).click();
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      });
    }
  });
}

test('a dialog with its own focus target keeps it: Request changes opens on the note', async ({ page }) => {
  await open(page, '/approvals');
  await page.getByRole('button', { name: 'Request changes' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('textarea')).toBeFocused();
});
