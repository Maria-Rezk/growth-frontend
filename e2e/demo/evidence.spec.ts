import fs from 'node:fs';
import path from 'node:path';
import { ROUTES, expect, test } from './fixtures';

/*
  Visual evidence and the route verification matrix, written to ./qa:

    qa/screenshots/<name>-desktop.png   1440 x 900, full page
    qa/screenshots/<name>-mobile.png    375 x 812, full page
    qa/route-matrix.md                  every route, both sizes, what was checked

  Demo mode: the screenshots show sample data from the demo workspace, not a
  real client. Run with `npm run e2e:evidence`.
*/
const OUT = path.resolve('qa');
const SHOTS = path.join(OUT, 'screenshots');

/** The pages asked for as screenshots. The rest of the routes are still checked in the matrix. */
const CAPTURE = new Set(['/my-work', '/dashboard', '/content-plans', '/leads', '/tasks', '/approvals', '/responsibilities', '/automations', '/reports', '/members', '/admin/dashboard']);

const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 375, height: 812 } },
] as const;

interface Row {
  route: string;
  label: string;
  size: string;
  heading: string;
  overflow: boolean;
  consoleErrors: number;
  loadMs: number;
  screenshot: string | null;
}

const rows: Row[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

for (const size of SIZES) {
  for (const route of ROUTES) {
    test(`${size.name} · ${route.label} @evidence`, async ({ page, consoleErrors }) => {
      await page.setViewportSize(size.viewport);
      const started = Date.now();
      await page.goto(route.path);
      const heading = page.locator('main h1').first();
      await expect(heading).toHaveText(route.heading);
      await page.waitForLoadState('networkidle');
      const loadMs = Date.now() - started;
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

      let screenshot: string | null = null;
      if (CAPTURE.has(route.path)) {
        const file = `${route.path.replace(/^\//, '').replace(/\//g, '-') || 'root'}-${size.name}.png`;
        await page.screenshot({ path: path.join(SHOTS, file), fullPage: true, animations: 'disabled' });
        screenshot = `screenshots/${file}`;
      }

      rows.push({ route: route.path, label: route.label, size: size.name, heading: (await heading.innerText()).trim(), overflow, consoleErrors: consoleErrors.length, loadMs, screenshot });
      expect(overflow).toBe(false);
    });
  }
}

test.afterAll(() => {
  const status = (row?: Row) => (!row ? '—' : row.overflow || row.consoleErrors ? 'FAIL' : 'pass');
  const lines = [
    '# Route verification matrix',
    '',
    `Generated ${new Date().toISOString()} by \`npm run e2e:evidence\` (Playwright, Chrome).`,
    '',
    '**Environment: demo mode** (local Vite server, in-memory sample data, no backend).',
    'A "pass" here means the page rendered its heading, logged no console errors and did not',
    'scroll sideways. It is not evidence of compatibility with the real API.',
    '',
    '| Route | Page | Heading rendered | Desktop 1440 | Mobile 375 | Desktop load | Screenshots |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const route of ROUTES) {
    const desktop = rows.find((row) => row.route === route.path && row.size === 'desktop');
    const mobile = rows.find((row) => row.route === route.path && row.size === 'mobile');
    const shots = [desktop?.screenshot, mobile?.screenshot].filter(Boolean).map((shot) => `[${shot!.includes('mobile') ? 'mobile' : 'desktop'}](${shot})`).join(' · ') || '—';
    lines.push(`| \`${route.path}\` | ${route.label} | ${desktop?.heading ?? mobile?.heading ?? '—'} | ${status(desktop)} | ${status(mobile)} | ${desktop ? `${desktop.loadMs} ms` : '—'} | ${shots} |`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'route-matrix.md'), `${lines.join('\n')}\n`);
});
