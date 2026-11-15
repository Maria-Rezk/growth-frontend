import type { Page } from '@playwright/test';
import { expect, open, sidebar, test } from './fixtures';

/*
  Tasks board scrolling (live report: the page would not scroll, and the
  last stages could not be reached).

  Two causes, each pinned here:
  1. The dialog scroll lock leaked. Each Modal saved and restored
     `body.style.overflow` on its own; with the discard confirm over the task
     form, "Discard" closed both and the confirm put back the form's "hidden".
     The page then stayed locked with no dialog open.
  2. The six columns (1,692px) are wider than the board, and their only scroll
     bar sat at the bottom of a strip thousands of pixels tall; on a desktop
     nothing said more stages were there. The board now has a sticky stage bar.

  Demo seed: four tasks, in Todo, In progress (2) and In review. `seedMany`
  adds more to the in-memory store before the task list is first fetched, so
  it has to run on another page and reach Tasks by client-side navigation.
*/

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 812 };

async function seedMany(page: Page, perStatus = 25) {
  await open(page, '/leads');
  await page.evaluate(async ({ count, url }) => {
    // The page's own module instance, as Vite serves it: the same array the demo services read.
    const store = (await import(/* @vite-ignore */ url)) as { demoTasks: Array<Record<string, unknown>> };
    const base = store.demoTasks[2];
    for (const status of ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELED']) {
      for (let index = 0; index < count; index += 1) {
        store.demoTasks.push({ ...base, id: `bulk-${status}-${index}`, status, title: `Bulk ${status.toLowerCase()} task ${index}` });
      }
    }
  }, { count: perStatus, url: '/src/services/demoStore.ts' });
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  await sidebar(page).getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.locator('main .kanban-card', { hasText: 'Bulk todo task 0' })).toBeVisible();
  // Focus where a person reading the board would be: not in the sidebar's own scroller.
  await page.locator('main h1').click();
}

/** The demo's own four tasks, once the board (not its skeleton) is up. */
async function openBoard(page: Page) {
  await open(page, '/tasks');
  await expect(page.locator('main .kanban-card:not(.skeleton-card)').first()).toBeVisible();
}

const bodyOverflow = (page: Page) => page.evaluate(() => document.body.style.overflow);
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const strip = (page: Page) => page.locator('main .kanban');
const nav = (page: Page) => page.locator('main .kanban-nav');

/** Whether a column sits wholly inside the strip's visible box. */
async function columnInView(page: Page, name: RegExp): Promise<boolean> {
  const column = page.locator('main .kanban-column').filter({ has: page.locator('.kanban-column__header', { hasText: name }) });
  const [box, col] = await Promise.all([strip(page).boundingBox(), column.boundingBox()]);
  return Boolean(box && col && col.x >= box.x - 1 && col.x + col.width <= box.x + box.width + 1);
}

/**
 * A finger drag from (x, y) that scrolls the content `right` and `down`
 * (the finger moves the other way). Raw touch events, so the browser's own
 * touch scrolling runs; needs a `hasTouch` context. (`synthesizeScrollGesture`
 * with a touch source does not scroll anything in this headed Chrome.)
 */
async function swipe(page: Page, x: number, y: number, scroll: { right?: number; down?: number }) {
  const cdp = await page.context().newCDPSession(page);
  const [dx, dy] = [-(scroll.right ?? 0), -(scroll.down ?? 0)];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('dialogs never leave the page scroll-locked', () => {
  test('discarding the task form through its confirm unlocks the page', async ({ page }) => {
    await seedMany(page);
    await page.getByRole('button', { name: 'New task' }).click();
    await page.getByRole('dialog').getByLabel(/Title/).first().fill('Typed, then discarded');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(2);
    expect(await bodyOverflow(page)).toBe('hidden');

    await page.getByRole('button', { name: /Discard/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await bodyOverflow(page)).toBe('');

    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(500);
  });

  test('backing out of the confirm keeps the form locked; closing the form unlocks', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'New task' }).click();
    await page.getByRole('dialog').getByLabel(/Title/).first().fill('Kept');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await bodyOverflow(page)).toBe('hidden');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Discard/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await bodyOverflow(page)).toBe('');
  });

  test('search, notifications and the phone drawer leave the page scrollable', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedMany(page);
    await page.locator('.topbar .search-trigger').click();
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.topbar').getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByRole('region', { name: 'Recent notifications' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--open/);

    expect(await bodyOverflow(page)).toBe('');
    await expect(page.locator('.main-shell')).not.toHaveAttribute('inert');
    await page.mouse.move(180, 600);
    await page.mouse.wheel(0, 700);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  });
});

test.describe('the Tasks board scrolls', () => {
  test('a long board scrolls the page with the wheel over the cards, to the very last action', async ({ page }) => {
    await seedMany(page);
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(1000);
    // The page is the only vertical scroller: the strip never takes the wheel.
    expect(await strip(page).evaluate((el) => [getComputedStyle(el).overflowY, el.scrollHeight - el.clientHeight])).toEqual(['hidden', 0]);

    await page.keyboard.press('End');
    const more = page.locator('main .kanban-column').first().getByRole('button', { name: /Show \d+ more/ });
    await expect(more).toBeInViewport();
    // Keyboard scrolls animate; on a loaded machine Home can land while End is still running.
    await expect(async () => {
      await page.keyboard.press('Home');
      await expect.poll(() => scrollY(page), { timeout: 2_000 }).toBe(0);
    }).toPass({ timeout: 10_000 });
  });

  test('every stage is reachable sideways inside the board, from a bar that stays on screen', async ({ page }) => {
    await seedMany(page);
    await expect(nav(page)).toContainText('Stages 1–4 of 6');
    expect(await columnInView(page, /Canceled/)).toBe(false);
    const earlier = page.getByRole('button', { name: 'Show earlier stages' });
    const later = page.getByRole('button', { name: 'Show later stages' });
    await expect(earlier).toBeDisabled();

    // Deep in a long board the bar is still under the topbar.
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
    await page.mouse.wheel(0, 2500);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(2000);
    await expect(later).toBeInViewport();

    while (await later.isEnabled()) {
      await later.click();
      await page.waitForTimeout(450);
    }
    expect(await columnInView(page, /Done/)).toBe(true);
    expect(await columnInView(page, /Canceled/)).toBe(true);
    await expect(nav(page)).toContainText('of 6');
    await expect(page.locator('main .kanban-scroller')).not.toHaveAttribute('data-more-end');
    // Only the board moved sideways, never the app.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);

    await earlier.focus();
    while (await earlier.isEnabled()) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);
    }
    expect(await columnInView(page, /Todo/)).toBe(true);
  });

  test('a sideways trackpad gesture over the board scrolls the board, not the page', async ({ page }) => {
    await openBoard(page);
    await expect(nav(page)).toBeVisible();
    const box = (await strip(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    // Under a loaded CPU one wheel event can land before the strip is hit-testable; repeat until it moves.
    await expect(async () => {
      await page.mouse.wheel(600, 0);
      expect(await strip(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
    }).toPass({ timeout: 8_000 });
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });

  test('tabbing to a card in a hidden stage brings it into view', async ({ page }) => {
    await seedMany(page, 1);
    const card = page.locator('main .kanban-card', { hasText: 'Bulk canceled task 0' });
    await card.focus();
    await expect(card).toBeInViewport();
    expect(await columnInView(page, /Canceled/)).toBe(true);
  });

  test('resizing (or zooming) re-measures the bar', async ({ page }) => {
    await openBoard(page);
    await expect(nav(page)).toContainText('Stages 1–4 of 6');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(nav(page)).toContainText('Stages 1–2 of 6');
    // Zoom at 200%: the CSS viewport halves.
    await page.setViewportSize({ width: 720, height: 450 });
    await expect(nav(page)).toContainText(/Stages? 1(–\d)? of 6/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('Table view scrolls the page and shows no board bar', async ({ page }) => {
    await seedMany(page);
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(nav(page)).toHaveCount(0);
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height / 2);
    await page.mouse.wheel(0, 800);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);
  });
});

test.describe('the Tasks board on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('swipes scroll the page down and the board sideways; the swipe hint stays', async ({ page }) => {
    await seedMany(page);
    await expect(page.locator('main .board-hint')).toHaveText('Swipe sideways for the other 5 stages →');
    await expect(page.locator('main .kanban-scroller')).toHaveAttribute('data-more-end', '');

    // Up the page, with the finger starting on a card.
    await swipe(page, PHONE.width / 2, 740, { down: 500 });
    await expect.poll(() => scrollY(page)).toBeGreaterThan(300);

    // Sideways on the board: the board moves, the page does not. Let the
    // first swipe's momentum finish first, or its fling counts against this one.
    let y = -1;
    await expect.poll(async () => {
      const before = await scrollY(page);
      await page.waitForTimeout(250);
      const settled = before === await scrollY(page);
      y = before;
      return settled;
    }).toBe(true);
    await swipe(page, PHONE.width - 40, 400, { right: 300 });
    await expect.poll(() => strip(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    expect(Math.abs((await scrollY(page)) - y)).toBeLessThan(40);
    expect(await page.evaluate(() => [window.scrollX, document.documentElement.scrollWidth <= window.innerWidth])).toEqual([0, true]);
  });

  test('the Later button walks to the last stage', async ({ page }) => {
    await openBoard(page);
    const later = page.getByRole('button', { name: 'Show later stages' });
    for (let i = 0; i < 6 && await later.isEnabled(); i += 1) {
      await later.click();
      await page.waitForTimeout(450);
    }
    await expect(later).toBeDisabled();
    expect(await columnInView(page, /Canceled/)).toBe(true);
  });
});

test.describe('other boards share the fix', () => {
  for (const path of ['/leads', '/posts']) {
    test(`${path}: the board bar reaches the last stage and the page does not scroll sideways`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator('main .kanban-card:not(.skeleton-card)').first()).toBeVisible();
      const later = page.getByRole('button', { name: 'Show later stages' });
      // Decided by the strip, not by the bar: the bar appears a frame after the board does.
      if (await strip(page).evaluate((el) => el.scrollWidth - el.clientWidth) <= 1) {
        await expect(nav(page)).toHaveCount(0);
        return;
      }
      await expect(nav(page)).toBeVisible();
      for (let i = 0; i < 10 && await later.isEnabled(); i += 1) {
        await later.click();
        await page.waitForTimeout(450);
      }
      await expect(later).toBeDisabled();
      const last = page.locator('main .kanban-column').last();
      const [box, col] = await Promise.all([strip(page).boundingBox(), last.boundingBox()]);
      expect(col!.x + col!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
