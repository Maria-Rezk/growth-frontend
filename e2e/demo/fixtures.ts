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

/** The 25 routes a staff member with every permission can reach, with the heading each must show. */
export const ROUTES: ReadonlyArray<{ path: string; heading: RegExp; label: string }> = [
  { path: '/my-work', heading: /My work/, label: 'My work' },
  { path: '/dashboard', heading: /Solu1ions Demo Workspace/, label: 'Client overview' },
  { path: '/brand-profile', heading: /Brand profile/, label: 'Brand profile' },
  { path: '/content-plans', heading: /Content plans/, label: 'Content plans' },
  { path: '/content-plans/plan-1', heading: /June Growth Content Plan/, label: 'Content plan detail' },
  { path: '/ai-studio', heading: /AI studio/, label: 'AI studio' },
  { path: '/posts', heading: /Content posts/, label: 'Content posts' },
  { path: '/posts/post-1', heading: /Agency Growth OS launch teaser/, label: 'Post detail' },
  { path: '/campaigns', heading: /Campaigns/, label: 'Campaigns' },
  { path: '/campaigns/campaign-1', heading: /Summer Laser Offer Campaign/, label: 'Campaign detail' },
  { path: '/leads', heading: /Leads/, label: 'Leads CRM' },
  { path: '/leads/lead-1', heading: /Nour Clinic/, label: 'Lead detail' },
  { path: '/tasks', heading: /Tasks/, label: 'Tasks' },
  { path: '/tasks/task-1', heading: /Revise launch carousel CTA/, label: 'Task detail' },
  { path: '/approvals', heading: /Approval queue/, label: 'Approval queue' },
  { path: '/responsibilities', heading: /Responsibility matrix/, label: 'Responsibilities' },
  { path: '/automations', heading: /Automations/, label: 'Automations' },
  { path: '/reports', heading: /Reports/, label: 'Reports' },
  { path: '/members', heading: /Members/, label: 'Members' },
  { path: '/notifications', heading: /Notifications/, label: 'Notifications' },
  { path: '/home', heading: /Home/, label: 'Client home' },
  { path: '/admin/dashboard', heading: /Operations dashboard/, label: 'Operations dashboard' },
  { path: '/admin/activity', heading: /Activity log/, label: 'Activity log' },
  { path: '/admin/employees', heading: /Employees/, label: 'Employees' },
  { path: '/admin/clients', heading: /Clients/, label: 'Clients' },
];
