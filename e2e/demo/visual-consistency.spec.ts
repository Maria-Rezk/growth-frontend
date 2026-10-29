import type { Locator, Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/*
  Phase 3B-2 visual consistency, read from the rendered pages rather than
  from the stylesheet: what the browser actually paints is what counts.
*/

const MAGENTA = 'rgb(201, 20, 75)';
const DARK_ACCENT = 'rgb(242, 120, 159)';

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    try { window.localStorage.setItem('growth.theme', value); } catch { /* storage blocked */ }
  }, theme);
}

/** accent-color of every visible native checkbox and radio under `root`. */
async function controlAccents(root: Locator) {
  return root.evaluate((element) => [...element.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')]
    .filter((input) => input.getBoundingClientRect().width > 0 && getComputedStyle(input).opacity !== '0')
    .map((input) => ({ id: input.id || input.name || input.outerHTML.slice(0, 60), accent: getComputedStyle(input).accentColor })));
}

test.describe('native checkboxes and radios use the brand accent (N-11)', () => {
  for (const [theme, colour] of [['light', MAGENTA], ['dark', DARK_ACCENT]] as const) {
    test(`${theme}: notification preferences and the role checklist`, async ({ page }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 1440, height: 900 });

      await open(page, '/notifications');
      const preferences = await controlAccents(page.locator('main'));
      expect(preferences.length, 'the preferences page has checkboxes').toBeGreaterThan(0);
      for (const control of preferences) expect(control.accent, control.id).toBe(colour);

      await open(page, '/admin/employees');
      await page.locator('main').getByRole('button', { name: 'Assign to client' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('checkbox', { name: 'Designer' })).toBeVisible();
      const roles = await controlAccents(dialog);
      expect(roles.length).toBeGreaterThan(5);
      for (const control of roles) expect(control.accent, control.id).toBe(colour);
    });
  }
});

test.describe('type floor (F-33)', () => {
  const PAGES = ['/my-work', '/tasks', '/leads', '/approvals', '/posts?view=calendar', '/responsibilities', '/automations', '/notifications', '/posts/post-1', '/admin/activity'];

  for (const viewport of [{ width: 320, height: 640 }, { width: 1440, height: 900 }]) {
    test(`${viewport.width}px: nothing under 11px, and 11px only for caps labels and numbers`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of PAGES) {
        await open(page, path);
        const offenders = await page.evaluate(() => {
          const found: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent?.trim() ?? '';
            const element = node.parentElement;
            if (!text || !element) continue;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (!rect.width || style.visibility === 'hidden' || element.closest('[aria-hidden="true"], .sr-only, .table-sort-icon')) continue;
            // The documented exception: step names in the four ~57px columns of the stepper under 360px.
            if (window.innerWidth < 360 && element.matches('.workflow-step strong') && parseFloat(style.fontSize) === 11) continue;
            const size = parseFloat(style.fontSize);
            const capsOrNumber = style.textTransform === 'uppercase' || /^[\d+\-–·:./%\s]+$/.test(text) || element.closest('kbd');
            if (size < 11 || (size < 12 && !capsOrNumber)) found.push(`${size}px "${text.slice(0, 30)}" in .${element.className}`);
          }
          return [...new Set(found)];
        });
        expect(offenders, `${path} at ${viewport.width}px`).toEqual([]);
      }
    });
  }
});
