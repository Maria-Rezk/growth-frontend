import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  New notifications reach the bell without a page reload, and the badge and
  the dropdown list move together.

  The trigger is an invitation: in the demo it adds a notification without
  telling the notification feed, exactly like a notification written by
  somebody else on the server. The demo seed starts with 2 unread.
*/

const bell = (page: Page) => page.locator('.topbar').getByRole('button', { name: /^Notifications/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Recent notifications' });

async function inviteSomebody(page: Page) {
  await page.getByRole('button', { name: 'Invite member' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Refresh Check');
  await dialog.getByLabel('Email').fill('refresh-check@example.test');
  await dialog.getByLabel('Role').selectOption('ART_DIRECTOR');
  await dialog.getByRole('button', { name: 'Create invitation' }).click();
  await expect(dialog.getByText('Share this link now')).toBeVisible();
  // "Done" asks before dropping the typed form (existing behaviour); the invitation is already made.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('notifications refresh on their own', () => {
  test('a new notification appears within 30 seconds, badge and list together', async ({ page }) => {
    await page.clock.install();
    await open(page, '/members');
    await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread');

    await inviteSomebody(page);
    // Nothing has asked for it yet.
    await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread');

    await page.clock.fastForward(31_000);
    await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
    await bell(page).click();
    await expect(panel(page)).toContainText('3 unread');
    await expect(panel(page).getByRole('button', { name: /Invitation created/ })).toBeVisible();
  });

  test('opening the bell fetches the latest at once', async ({ page }) => {
    await open(page, '/members');
    await inviteSomebody(page);
    await bell(page).click();
    await expect(panel(page).getByRole('button', { name: /Invitation created/ })).toBeVisible();
    // The badge was refreshed by the same request round.
    await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
    await expect(panel(page)).toContainText('3 unread');
  });

  test('returning to the tab refreshes it', async ({ page }) => {
    await open(page, '/members');
    await inviteSomebody(page);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
  });

  test('coming back online refreshes it', async ({ page, context }) => {
    await open(page, '/members');
    await inviteSomebody(page);
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(bell(page)).toHaveAccessibleName('Notifications, 3 unread');
  });

  test('Mark all read clears the badge and the list together', async ({ page }) => {
    await open(page, '/members');
    await bell(page).click();
    await panel(page).getByRole('button', { name: 'Mark all read' }).click();
    await expect(panel(page)).toContainText('You are caught up');
    await expect(bell(page)).toHaveAccessibleName('Notifications');
  });
});
