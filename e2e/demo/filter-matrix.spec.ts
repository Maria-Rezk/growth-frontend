import type { Page } from '@playwright/test';
import { expect, open, sidebar, test } from './fixtures';

/*
  Filtering regression matrix. Filters live in the URL (useUrlFilters), so a
  filtered list is a link, survives a reload, and Back from a record lands on
  the same filtered list. Every assertion checks the records actually shown,
  not only the URL.

  Demo leads: Nour Clinic (INTERESTED, INSTAGRAM), Alpha Retail (CONTACTED,
  WEBSITE), Daleel Chicago (NEW, REFERRAL).
*/

const leadNames = (page: Page) => page.locator('main .kanban-card strong, main .data-table tbody tr td:first-child');
const LEADS = ['Nour Clinic', 'Alpha Retail', 'Daleel Chicago'];
// A table cell also carries contact details after the name, so match by the name it starts with.
const visibleLeads = async (page: Page) => (await leadNames(page).allTextContents())
  .map((text) => LEADS.find((name) => text.trim().startsWith(name)))
  .filter((name): name is string => Boolean(name));
const stage = (page: Page, name: RegExp) => page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button', { name });

test.describe('Leads filters', () => {
  test('stage chips and the Status select stay in sync both ways', async ({ page }) => {
    await open(page, '/leads');
    await stage(page, /^Contacted/).click();
    await expect(page.locator('#lead-filter')).toHaveValue('CONTACTED');
    await expect.poll(() => visibleLeads(page)).toEqual(['Alpha Retail']);

    await page.locator('#lead-filter').selectOption('NEW');
    await expect(stage(page, /^New/)).toHaveAttribute('aria-pressed', 'true');
    await expect(stage(page, /^Contacted/)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => visibleLeads(page)).toEqual(['Daleel Chicago']);
  });

  test('search, status and source combine', async ({ page }) => {
    await open(page, '/leads');
    await page.locator('#lead-search').fill('Clinic');
    await page.locator('#lead-filter').selectOption('INTERESTED');
    await page.locator('#lead-source-filter').selectOption('INSTAGRAM');
    await expect(page).toHaveURL(/search=Clinic/);
    await expect(page).toHaveURL(/status=INTERESTED/);
    await expect(page).toHaveURL(/source=INSTAGRAM/);
    await expect.poll(() => visibleLeads(page)).toEqual(['Nour Clinic']);

    // One filter that excludes it: nothing left.
    await page.locator('#lead-source-filter').selectOption('WEBSITE');
    await expect.poll(() => visibleLeads(page)).toEqual([]);
  });

  test('switching Pipeline and Table keeps the active filters', async ({ page }) => {
    await open(page, '/leads');
    await page.locator('#lead-source-filter').selectOption('REFERRAL');
    await expect.poll(() => visibleLeads(page)).toEqual(['Daleel Chicago']);

    await page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' }).click();
    await expect(page.locator('main .data-table')).toBeVisible();
    await expect(page.locator('#lead-source-filter')).toHaveValue('REFERRAL');
    await expect.poll(() => visibleLeads(page)).toEqual(['Daleel Chicago']);

    await page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Pipeline' }).click();
    await expect(page.locator('main .kanban-card')).toHaveCount(1);
    await expect(page).toHaveURL(/source=REFERRAL/);
  });

  test('Clear filters resets every filter, keeps the view, and shows every lead', async ({ page }) => {
    await open(page, '/leads');
    await page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' }).click();
    await page.locator('#lead-search').fill('Nobody matches this');
    await expect(page.locator('main').getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await page.locator('main').getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('#lead-search')).toHaveValue('');
    await expect(page).toHaveURL(/view=table/);
    await expect(page).not.toHaveURL(/search=|status=|source=/);
    await expect.poll(async () => (await visibleLeads(page)).sort()).toEqual(['Alpha Retail', 'Daleel Chicago', 'Nour Clinic']);
  });

  test('changing a filter returns to page 1', async ({ page }) => {
    // Three demo leads cannot fill a page, so start from a deep link to page 3.
    await open(page, '/leads?view=table&page=3');
    await expect(page).toHaveURL(/page=3/);
    await page.locator('#lead-filter').selectOption('NEW');
    await expect(page).not.toHaveURL(/page=/);
    await expect.poll(() => visibleLeads(page)).toEqual(['Daleel Chicago']);
  });

  test('a filtered URL restores the same state on load', async ({ page }) => {
    await open(page, '/leads?status=CONTACTED&source=WEBSITE&view=table');
    await expect(page.locator('#lead-filter')).toHaveValue('CONTACTED');
    await expect(page.locator('#lead-source-filter')).toHaveValue('WEBSITE');
    await expect(page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(stage(page, /^Contacted/)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => visibleLeads(page)).toEqual(['Alpha Retail']);

    await page.reload();
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('#lead-filter')).toHaveValue('CONTACTED');
    await expect.poll(() => visibleLeads(page)).toEqual(['Alpha Retail']);
  });

  test('Back from a lead returns to the same filtered list, and Forward goes back to the lead', async ({ page }) => {
    await open(page, '/leads');
    await page.locator('#lead-filter').selectOption('INTERESTED');
    await expect.poll(() => visibleLeads(page)).toEqual(['Nour Clinic']);
    await page.locator('main .kanban-card', { hasText: 'Nour Clinic' }).click();
    await expect(page).toHaveURL(/\/leads\/lead-1$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/leads\?status=INTERESTED/);
    await expect(page.locator('#lead-filter')).toHaveValue('INTERESTED');
    await expect.poll(() => visibleLeads(page)).toEqual(['Nour Clinic']);

    await page.goForward();
    await expect(page).toHaveURL(/\/leads\/lead-1$/);
  });

  test('changing filters replaces the history entry: Back leaves the list instead of undoing each filter', async ({ page }) => {
    await open(page, '/my-work');
    await sidebar(page).getByRole('link', { name: 'Leads', exact: true }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await page.locator('#lead-filter').selectOption('NEW');
    await page.locator('#lead-source-filter').selectOption('REFERRAL');
    await page.goBack();
    await expect(page).toHaveURL(/\/my-work$/);
  });
});

test.describe('the same URL filters on Tasks and Posts', () => {
  test('Tasks: status and type combine, survive a reload, and filter the board', async ({ page }) => {
    await open(page, '/tasks');
    await page.locator('#task-filter').selectOption('IN_PROGRESS');
    await page.locator('#task-type-filter').selectOption('OTHER');
    await expect(page).toHaveURL(/status=IN_PROGRESS/);
    await expect(page).toHaveURL(/type=OTHER/);
    await expect(page.locator('main .kanban-card')).toHaveCount(1);
    await expect(page.locator('main .kanban-card')).toContainText('Follow up with Nour Clinic');

    await page.reload();
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('#task-filter')).toHaveValue('IN_PROGRESS');
    await expect(page.locator('#task-type-filter')).toHaveValue('OTHER');
    await expect(page.locator('main .kanban-card')).toHaveCount(1);
  });

  test('Tasks: the PLAN type filter reads "Content" and still sends type=PLAN', async ({ page }) => {
    await open(page, '/tasks');
    const filter = page.locator('#task-type-filter');
    await expect(filter.locator('option[value="PLAN"]')).toHaveText('Content');
    await filter.selectOption({ label: 'Content' });
    await expect(page).toHaveURL(/type=PLAN/);
  });

  test('Posts: a stage tile, search and the view switch combine and are kept in the URL', async ({ page }) => {
    await open(page, '/posts');
    await page.getByRole('group', { name: 'Filter by workflow stage' }).getByRole('button', { name: /^Draft/ }).click();
    await expect(page.locator('#status-filter')).toHaveValue('DRAFT');
    await page.locator('#post-search').fill('workflow');
    await page.getByRole('group', { name: 'Content view' }).getByRole('button', { name: 'Table' }).click();
    await expect(page).toHaveURL(/status=DRAFT/);
    await expect(page).toHaveURL(/search=workflow/);
    await expect(page).toHaveURL(/view=table/);
    await expect(page.locator('main .data-table tbody tr')).toHaveCount(1);
    await expect(page.locator('main .data-table')).toContainText('Client approval workflow explainer');
  });
});
