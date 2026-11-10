import { expect, open, test } from './fixtures';

/*
  Release guide 1.5: the status action is hidden — not disabled — on the
  signed-in person's own row. The demo user is a Super Admin, so another
  employee's row still offers Deactivate. (The Agency Admin / Super Admin
  rule is pinned by unit tests: the demo signs in as one fixed Super Admin.)
*/
test('Employees: no status action on your own row; offered on somebody else’s', async ({ page }) => {
  await open(page, '/admin/employees');
  const own = page.getByRole('row').filter({ hasText: 'Demo User' });
  await expect(own).toBeVisible();
  await expect(own.getByRole('button', { name: /^(Deactivate|Activate) / })).toHaveCount(0);

  const other = page.getByRole('row').filter({ hasText: 'Demo Designer' });
  await expect(other.getByRole('button', { name: 'Deactivate Demo Designer' })).toBeEnabled();
});
