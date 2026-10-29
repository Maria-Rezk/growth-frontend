import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ROUTES, expect, open, test } from './fixtures';

/*
  V-3: automated accessibility audit with axe-core. Run with `npm run e2e:a11y`.

  Every route, the public sign-in pages, the create dialogs and the overlays,
  in light and dark, at 1440 and 375 px. WCAG 2.0-2.2 A/AA rules plus axe's
  best practices. Every violation is written to e2e/.artifacts/a11y-report.json
  with its impact (critical, serious, moderate, minor).

  A violation fails the run unless it is one of the KNOWN findings below:
  each is outside Phase 3B-2's scope and documented, with evidence and a
  recommended fix, in docs/frontend-audit-2026-10-28.md ("V-3 findings").
  Fixing one means deleting its entry here. Anything new fails.

  Automated checks find perhaps a third of real problems. They do not replace
  testing with a screen reader and a keyboard.
*/

const KNOWN: ReadonlyArray<{ rule: string; target: RegExp; ref: string }> = [
  { rule: 'aria-required-children', target: /\.calendar__grid/, ref: 'A-1' },
  { rule: 'aria-required-parent', target: /\.calendar__(weekday|day|cell)|role="gridcell"|gridcell|calendar/, ref: 'A-1' },
  { rule: 'nested-interactive', target: /\.notification-item/, ref: 'A-2' },
  { rule: 'aria-allowed-role', target: /\.notification-item/, ref: 'A-2' },
  { rule: 'aria-input-field-name', target: /\.palette__results/, ref: 'A-3' },
  { rule: 'aria-allowed-role', target: /#app-sidebar/, ref: 'A-4' },
  { rule: 'landmark-unique', target: /#app-sidebar|\.topbar|aside|header|nav|main/, ref: 'A-5' },
  { rule: 'landmark-no-duplicate-banner', target: /\.topbar|header/, ref: 'A-5' },
  { rule: 'region', target: /\.skip-link/, ref: 'A-6' },
  { rule: 'skip-link', target: /\.skip-link/, ref: 'A-6' },
  { rule: 'empty-table-header', target: /th/, ref: 'A-7' },
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const REPORT = path.resolve('e2e/.artifacts/a11y-report.json');
const THEMES = ['light', 'dark'] as const;
const SIZES = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 812 }] as const;

const EXTRA_ROUTES = ['/posts?view=table', '/posts?view=calendar', '/leads?view=table', '/tasks?view=table', '/reports/report-1', '/taks'];
const PUBLIC = ['/login', '/forgot-password', '/accept-invitation?token=demo-invite-token'];
const DIALOGS: ReadonlyArray<[string, string]> = [
  ['/leads', 'New lead'], ['/posts', 'New post'], ['/campaigns', 'New campaign'], ['/tasks', 'New task'],
  ['/content-plans', 'New plan'], ['/admin/clients', 'Add client'], ['/admin/clients', 'Manage'],
  ['/admin/employees', 'Add employee'], ['/admin/employees', 'Assign to client'], ['/members', 'Invite member'],
];

interface Finding { scene: string; theme: string; size: string; rule: string; impact: string; help: string; target: string; known: string | null }
const findings: Finding[] = [];

test.afterAll(() => {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(findings, null, 1));
});

async function audit(page: Page, scene: string, theme: string, size: string) {
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const unexpected: string[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const target = `${node.target.join(' ')} ${node.html.slice(0, 120)}`;
      const known = KNOWN.find((entry) => entry.rule === violation.id && entry.target.test(target))?.ref ?? null;
      findings.push({ scene, theme, size, rule: violation.id, impact: violation.impact ?? 'unknown', help: violation.help, target: node.target.join(' '), known });
      if (!known) unexpected.push(`${violation.impact} ${violation.id}: ${node.target.join(' ')} — ${violation.help}`);
    }
  }
  expect(unexpected, `${scene} (${theme}, ${size})`).toEqual([]);
}

async function useTheme(page: Page, theme: string) {
  await page.addInitScript((value) => {
    try { window.localStorage.setItem('growth.theme', value); } catch { /* storage blocked */ }
  }, theme);
}

for (const theme of THEMES) {
  for (const size of SIZES) {
    test.describe(`${theme} · ${size.name} @a11y`, () => {
      test.beforeEach(async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize({ width: size.width, height: size.height });
      });

      for (const route of [...ROUTES.map((entry) => entry.path), ...EXTRA_ROUTES]) {
        test(`page ${route}`, async ({ page }) => {
          await open(page, route);
          await audit(page, route, theme, size.name);
        });
      }

      for (const [route, opener] of DIALOGS) {
        test(`dialog ${opener} on ${route}`, async ({ page }) => {
          await open(page, route);
          const button = page.locator('main').getByRole('button', { name: opener, exact: true }).first();
          await button.click();
          await expect(page.getByRole('dialog').first()).toBeVisible();
          await audit(page, `dialog: ${opener}`, theme, size.name);
        });
      }

      test('overlays: command palette, notifications, navigation', async ({ page }) => {
        await open(page, '/my-work');
        await page.keyboard.press('Control+k');
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.type('ca');
        await expect(page.getByRole('option').first()).toBeVisible();
        await audit(page, 'overlay: command palette', theme, size.name);
        await page.keyboard.press('Escape');

        await page.locator('.topbar').getByRole('button', { name: /Notifications/ }).first().click();
        await audit(page, 'overlay: notifications', theme, size.name);
        await page.keyboard.press('Escape');

        if (size.width < 800) {
          await page.locator('.topbar').getByRole('button', { name: /menu/i }).first().click();
          await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
          await audit(page, 'overlay: navigation drawer', theme, size.name);
        }
      });

      test('public pages, signed out', async ({ page }) => {
        await open(page, '/my-work');
        await page.getByRole('button', { name: 'Logout' }).click();
        await expect(page).toHaveURL(/\/login$/);
        for (const route of PUBLIC) {
          // In-app navigation: a full load would restore the demo session.
          await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, route);
          await expect(page.locator('h1').first()).toBeVisible();
          await audit(page, route, theme, size.name);
        }
      });
    });
  }
}
