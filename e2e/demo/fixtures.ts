import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every demo test fails on an uncaught page error or a `console.error`. A page
 * that renders but logs an error is not "working".
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    await use(errors);
    expect(errors, 'no console errors or uncaught exceptions').toEqual([]);
  }, { auto: true }],
});

export { expect };

/** Open a route and wait until its page heading has rendered. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible();
}

/** The demo's sidebar, by its accessible name. */
export function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Main navigation' });
}

/**
 * Who a route is for, as `src/App.tsx` guards it:
 * - `shared`: any signed-in member, staff or client.
 * - `agency`: staff only. AgencyRoute sends a client-side member to Home.
 * - `admin`: platform admins only. AdminRoute sends anyone else away.
 */
export type RouteAccess = 'shared' | 'agency' | 'admin';

/** The 25 routes a staff member with every permission can reach, with the heading each must show and who else may. */
export const ROUTES: ReadonlyArray<{ path: string; heading: RegExp; label: string; access: RouteAccess }> = [
  { path: '/my-work', heading: /My work/, label: 'My work', access: 'agency' },
  { path: '/dashboard', heading: /Solu1ions Demo Workspace/, label: 'Client overview', access: 'agency' },
  { path: '/brand-profile', heading: /Brand profile/, label: 'Brand profile', access: 'shared' },
  { path: '/content-plans', heading: /Content plans/, label: 'Content plans', access: 'shared' },
  { path: '/content-plans/plan-1', heading: /June Growth Content Plan/, label: 'Content plan detail', access: 'shared' },
  { path: '/ai-studio', heading: /AI studio/, label: 'AI studio', access: 'agency' },
  { path: '/posts', heading: /Content posts/, label: 'Content posts', access: 'shared' },
  { path: '/posts/post-1', heading: /Agency Growth OS launch teaser/, label: 'Post detail', access: 'shared' },
  { path: '/campaigns', heading: /Campaigns/, label: 'Campaigns', access: 'agency' },
  { path: '/campaigns/campaign-1', heading: /Summer Laser Offer Campaign/, label: 'Campaign detail', access: 'agency' },
  { path: '/leads', heading: /^Leads$/, label: 'Leads', access: 'agency' },
  { path: '/leads/lead-1', heading: /Nour Clinic/, label: 'Lead detail', access: 'agency' },
  { path: '/tasks', heading: /Tasks/, label: 'Tasks', access: 'agency' },
  { path: '/tasks/task-1', heading: /Revise launch carousel CTA/, label: 'Task detail', access: 'agency' },
  { path: '/approvals', heading: /Approval queue/, label: 'Approval queue', access: 'agency' },
  { path: '/responsibilities', heading: /^Responsibility matrix$/, label: 'Responsibility matrix', access: 'agency' },
  { path: '/automations', heading: /Automations/, label: 'Automations', access: 'agency' },
  { path: '/reports', heading: /Reports/, label: 'Reports', access: 'shared' },
  { path: '/members', heading: /Members/, label: 'Members', access: 'agency' },
  { path: '/notifications', heading: /Notifications/, label: 'Notifications', access: 'shared' },
  { path: '/home', heading: /Home/, label: 'Client home', access: 'shared' },
  { path: '/admin/dashboard', heading: /Operations dashboard/, label: 'Operations dashboard', access: 'admin' },
  { path: '/admin/activity', heading: /Activity log/, label: 'Activity log', access: 'admin' },
  { path: '/admin/employees', heading: /Employees/, label: 'Employees', access: 'admin' },
  { path: '/admin/clients', heading: /Clients/, label: 'Clients', access: 'admin' },
];
