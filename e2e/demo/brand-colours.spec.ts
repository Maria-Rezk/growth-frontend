import { expect, open, test } from './fixtures';

/*
  N-14: the colour picker beside each Hex field shows the colour however it
  was typed, never the browser's black for a valid value, and saving stores
  one form, "#rrggbb" in lower case.
*/

test.describe('brand colour picker (N-14)', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    test(`${viewport.width}px: three digits, no "#", either case all show their colour`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/brand-profile');
      const row = page.getByRole('group', { name: 'Colour 1' });
      const hex = row.getByLabel('Hex');
      const pick = row.getByLabel('Pick');

      for (const [typed, shown] of [['ABC', '#aabbcc'], ['#abc', '#aabbcc'], ['C9144B', '#c9144b'], ['#2B344F', '#2b344f'], ['f2f2f2', '#f2f2f2']]) {
        await hex.fill(typed);
        await expect(pick, typed).toHaveValue(shown);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    });
  }

  test('a half-typed value keeps the last colour instead of black, and is flagged on leaving the field', async ({ page }) => {
    await open(page, '/brand-profile');
    const row = page.getByRole('group', { name: 'Colour 1' });
    const hex = row.getByLabel('Hex');
    const pick = row.getByLabel('Pick');
    await hex.fill('#2b344f');
    await expect(pick).toHaveValue('#2b344f');
    await hex.fill('#2b');
    await expect(pick).toHaveValue('#2b344f');
    await hex.blur();
    await expect(row.getByText('Use a hex value such as #C9144B.')).toBeVisible();
  });

  test('picking a colour writes it into the Hex field and clears its error', async ({ page }) => {
    await open(page, '/brand-profile');
    const row = page.getByRole('group', { name: 'Colour 1' });
    const hex = row.getByLabel('Hex');
    await hex.fill('#2');
    await hex.blur();
    await expect(row.getByText('Use a hex value such as #C9144B.')).toBeVisible();
    await row.getByLabel('Pick').fill('#336699');
    await expect(hex).toHaveValue('#336699');
    await expect(row.getByText('Use a hex value such as #C9144B.')).toHaveCount(0);
  });

  test('saving stores the six-digit lower-case form of what was typed', async ({ page }) => {
    await open(page, '/brand-profile');
    const row = page.getByRole('group', { name: 'Colour 1' });
    await row.getByLabel('Hex').fill('ABC');
    await page.getByRole('button', { name: 'Save brand profile' }).click();
    await expect(page.getByText('Brand profile saved.')).toBeVisible();
    // The form is reset from what was stored.
    await expect(page.getByRole('group', { name: 'Colour 1' }).getByLabel('Hex')).toHaveValue('#aabbcc');
    await expect(page.getByRole('group', { name: 'Colour 1' }).getByLabel('Pick')).toHaveValue('#aabbcc');
  });

  test('keyboard: the Hex field and the picker are both reachable, in order', async ({ page }) => {
    await open(page, '/brand-profile');
    const row = page.getByRole('group', { name: 'Colour 1' });
    await row.getByLabel('Hex').focus();
    await page.keyboard.press('Tab');
    await expect(row.getByLabel('Pick')).toBeFocused();
  });
});
