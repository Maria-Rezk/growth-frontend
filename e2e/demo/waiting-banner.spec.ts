import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  F-28: the waiting banner can be snoozed for the rest of the day, per user,
  and never hides anything the person has not seen. The demo has one review
  (task-1) submitted a day ago, so the staff banner shows on every page but
  the queue.
*/

const KEY = 'growth.waiting-banner.snooze.demo-user';
const banner = (page: Page) => page.getByRole('region', { name: 'Reminder' });

/** Store a snooze the way the app does, with the given items and expiry. */
async function storeSnooze(page: Page, key: string, items: string[], expiresIn = 3_600_000) {
  await page.addInitScript(({ key: storageKey, items: stored, expiresIn: ttl }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ v: 1, savedAt: Date.now(), expiresAt: Date.now() + ttl, data: { items: stored } }));
  }, { key, items, expiresIn });
}

test.describe('waiting banner snooze (F-28)', () => {
  test('a link to the queue and a separate snooze button, both reachable by keyboard', async ({ page }) => {
    await open(page, '/my-work');
    await expect(banner(page)).toBeVisible();
    const link = banner(page).getByRole('link', { name: /A review has waited on you for over a day/ });
    await expect(link).toHaveAttribute('href', '/approvals');
    const snooze = banner(page).getByRole('button', { name: 'Snooze for today' });
    await link.focus();
    await page.keyboard.press('Tab');
    await expect(snooze).toBeFocused();
  });

  test('snoozing hides it for this user until midnight, says so, and keeps focus on the page', async ({ page }) => {
    await open(page, '/my-work');
    await banner(page).getByRole('button', { name: 'Snooze for today' }).press('Enter');
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByText('Reminder hidden until tomorrow. Anything newly late will still show it.')).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();

    // Stored for this user, until the coming local midnight.
    const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), KEY);
    expect(stored.data.items).toEqual(['task-1@1']);
    const midnight = await page.evaluate(() => { const end = new Date(); end.setHours(24, 0, 0, 0); return end.getTime(); });
    expect(Math.abs(stored.expiresAt - midnight)).toBeLessThan(5_000);

    // Other pages and a reload stay quiet.
    await open(page, '/tasks');
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    // The queue is still where the item is.
    await open(page, '/approvals');
    await expect(page.locator('main')).toContainText('Revise launch carousel CTA');
  });

  test('comes back the next day', async ({ page }) => {
    await storeSnooze(page, KEY, ['task-1@1'], -1);
    await open(page, '/my-work');
    await expect(banner(page)).toBeVisible();
  });

  test('a newly late item shows it again at once', async ({ page }) => {
    await storeSnooze(page, KEY, ['task-other@1']);
    await open(page, '/my-work');
    await expect(banner(page)).toBeVisible();
  });

  test('an item waiting into another day shows it again (the 24h to 48h escalation)', async ({ page }) => {
    await storeSnooze(page, KEY, ['task-1@0']);
    await open(page, '/my-work');
    await expect(banner(page)).toBeVisible();
  });

  test('a snooze is per user: another person’s snooze hides nothing', async ({ page }) => {
    await storeSnooze(page, 'growth.waiting-banner.snooze.someone-else', ['task-1@1']);
    await open(page, '/my-work');
    await expect(banner(page)).toBeVisible();
  });

  test('the snooze fits on a phone without growing the banner', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, '/my-work');
    const snooze = banner(page).getByRole('button', { name: 'Snooze for today' });
    await expect(snooze).toHaveText('Snooze for today');
    const box = (await snooze.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(32);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect((await banner(page).boundingBox())!.height).toBeLessThanOrEqual(56);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
});
