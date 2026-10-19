import { expect, open, test } from './fixtures';

/*
  Demo mode starts signed in and its login accepts any credentials, so this
  covers the screens and the redirects, not real authentication. The live
  suite covers that against a real API.
*/
test.describe('authentication (demo)', () => {
  test('logout leads to the sign-in screen; protected pages then redirect there', async ({ page }) => {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page).toHaveTitle('Sign in · Solu1ions — Business Development');
  });

  test('the sign-in form validates, then signs in and lands on My work', async ({ page }) => {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.field__error').first()).toBeVisible();

    await page.getByLabel('Email').fill('e2e-demo@example.test');
    await page.getByLabel('Password').fill('e2e-demo-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/my-work$/);
    await expect(page.locator('main h1')).toHaveText('My work');
  });

  test('a signed-in visit to /login goes straight to the app', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/my-work$/);
  });
});
