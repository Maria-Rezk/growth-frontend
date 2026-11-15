import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  Target sizes, measured as what a pointer actually hits: probe outward from a
  control's centre with elementFromPoint, so a hit area grown by padding or by
  a transparent ::before counts, and a control drawn small but clickable over
  a larger area is measured as it behaves. WCAG 2.5.8 wants 24x24 with any
  pointer; on touch screens we aim for 32px rows and 44px-tall icon controls.
*/
async function hitAreas(page: Page, selector: string) {
  return page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)]
    .filter((element) => element.getBoundingClientRect().width > 0)
    .slice(0, 8)
    .map((element) => {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const box = element.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hits = (x: number, y: number) => {
        const target = document.elementFromPoint(x, y);
        return Boolean(target && (target === element || element.contains(target)));
      };
      const reach = (dx: number, dy: number) => { let distance = 0; while (distance < 30 && hits(cx + dx * (distance + 1), cy + dy * (distance + 1))) distance += 1; return distance; };
      return { width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1 };
    }), selector);
}

async function expectAtLeast(page: Page, selector: string, minWidth: number, minHeight: number) {
  // Lists render after the heading, once their data has loaded.
  await page.locator(selector).first().waitFor();
  const areas = await hitAreas(page, selector);
  expect(areas.length, `${selector} is on the page`).toBeGreaterThan(0);
  for (const area of areas) {
    expect(area.width, `${selector} width`).toBeGreaterThanOrEqual(minWidth);
    expect(area.height, `${selector} height`).toBeGreaterThanOrEqual(minHeight);
  }
}

test.describe('targets with a mouse at desktop width (24x24 minimum)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('automation switches', async ({ page }) => {
    await open(page, '/automations');
    await expectAtLeast(page, '.switch', 24, 24);
  });

  test('notification preference rows, and every checkbox sits in its label', async ({ page }) => {
    await open(page, '/notifications');
    await expectAtLeast(page, '.checkbox-row', 24, 24);
    const loose = await page.locator('main input[type="checkbox"]').evaluateAll((boxes) => boxes.filter((box) => !box.closest('label')).length);
    expect(loose).toBe(0);
  });

  test('text buttons and links that stand alone', async ({ page }) => {
    await open(page, '/my-work');
    await expectAtLeast(page, '.work-row__title', 24, 24);
    await open(page, '/leads');
    await expectAtLeast(page, '.contact-row a', 24, 24);
    await open(page, '/leads/lead-1');
    await expectAtLeast(page, '.link-button', 24, 24);
    await open(page, '/reports');
    await expectAtLeast(page, '.table-sort-button', 24, 24);
  });
});

test.describe('targets on a touch phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('top bar icons are 44px tall to a finger and do not overlap', async ({ page }) => {
    await open(page, '/my-work');
    await expectAtLeast(page, '.topbar .icon-button, .topbar .search-trigger', 32, 44);
    // Hit areas never reach into a neighbour.
    const overlaps = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLElement>('.topbar .icon-button, .topbar .search-trigger, .topbar .btn')].filter((element) => element.getBoundingClientRect().width);
      return controls.slice(1).filter((element, index) => {
        const previous = controls[index].getBoundingClientRect();
        const box = element.getBoundingClientRect();
        const middle = (previous.right + box.left) / 2;
        const target = document.elementFromPoint(middle - 1, box.top + box.height / 2);
        return target !== null && element.contains(target);
      }).length;
    });
    expect(overlaps).toBe(0);
  });

  test('switches reach 44px tall', async ({ page }) => {
    await open(page, '/automations');
    await expectAtLeast(page, '.switch', 44, 44);
  });

  test('rows and standalone links keep 32px', async ({ page }) => {
    await open(page, '/notifications');
    await expectAtLeast(page, '.checkbox-row', 32, 32);
    await open(page, '/leads');
    await expectAtLeast(page, '.contact-row a', 32, 32);
    await open(page, '/my-work');
    await expectAtLeast(page, '.work-row__title', 32, 32);
  });

  test('the search button keeps its size on a 320px phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, '/my-work');
    const box = (await page.locator('.topbar .search-trigger').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('the open drawer\'s Close button reaches 44px tall', async ({ page }) => {
    await open(page, '/my-work');
    await page.getByRole('button', { name: 'Open menu' }).click();
    // Probe once the drawer has finished sliding in.
    await expect.poll(() => page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().left)).toBe(0);
    await expectAtLeast(page, '.sidebar__close', 32, 44);
  });
});
