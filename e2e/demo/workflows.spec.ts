import { expect, open, test } from './fixtures';

test.describe('leads', () => {
  /*
    REGRESSION (N-6): every Leads filter updated the URL twice in one event
    (the filter, then page 1) and the second update erased the first, so
    none of these ever applied.
  */
  test('the status filter narrows the list and is kept in the URL', async ({ page }) => {
    await open(page, '/leads');
    const main = page.locator('main');
    await expect(main.getByText('Alpha Retail').first()).toBeVisible();
    await page.locator('#lead-filter').selectOption('INTERESTED');
    await expect(page).toHaveURL(/status=INTERESTED/);
    await expect(page.locator('#lead-filter')).toHaveValue('INTERESTED');
    await expect(main.getByText('Nour Clinic').first()).toBeVisible();
    await expect(main.getByText('Alpha Retail')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Filter by pipeline stage' }).getByRole('button', { name: /Interested/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('search narrows the list', async ({ page }) => {
    await open(page, '/leads');
    await page.locator('#lead-search').fill('Daleel');
    await expect(page).toHaveURL(/search=Daleel/);
    await expect(page.locator('main').getByText('Daleel Chicago').first()).toBeVisible();
    await expect(page.locator('main').getByText('Nour Clinic')).toHaveCount(0);
  });

  /*
    The demo leads used to carry free-text sources ("Website", "Instagram DM")
    while the filter sends the API's enum values ("WEBSITE"), so filtering by
    source in demo mode always came back empty. These check the actual records.
  */
  for (const [source, match, others] of [
    ['REFERRAL', 'Daleel Chicago', ['Nour Clinic', 'Alpha Retail']],
    ['WEBSITE', 'Alpha Retail', ['Nour Clinic', 'Daleel Chicago']],
    ['INSTAGRAM', 'Nour Clinic', ['Alpha Retail', 'Daleel Chicago']],
  ] as const) {
    test(`the source filter ${source} shows exactly the matching lead`, async ({ page }) => {
      await open(page, '/leads');
      await page.locator('#lead-source-filter').selectOption(source);
      await expect(page).toHaveURL(new RegExp(`source=${source}`));
      const main = page.locator('main');
      await expect(main.locator('.kanban-card').filter({ hasText: match })).toHaveCount(1);
      for (const other of others) await expect(main.locator('.kanban-card').filter({ hasText: other })).toHaveCount(0);
    });
  }

  test('a source with no leads shows the filtered empty state', async ({ page }) => {
    await open(page, '/leads');
    await page.locator('#lead-source-filter').selectOption('TIKTOK');
    await expect(page.locator('main .kanban-card')).toHaveCount(0);
  });

  test('the Pipeline/Table switch changes the view, and Clear filters resets every filter', async ({ page }) => {
    await open(page, '/leads');
    const table = page.getByRole('group', { name: 'Lead view' }).getByRole('button', { name: 'Table' });
    await table.click();
    await expect(table).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/view=table/);
    await expect(page.locator('main .data-table')).toBeVisible();

    await page.locator('#lead-filter').selectOption('WON');
    await expect(page).toHaveURL(/status=WON/);
    await page.locator('main').getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('#lead-filter')).toHaveValue('');
    await expect(page).not.toHaveURL(/status=/);
    // Clearing filters keeps the chosen view.
    await expect(page).toHaveURL(/view=table/);
  });

  test('creating a lead validates the name, then adds it to the pipeline', async ({ page }) => {
    await open(page, '/leads');
    await page.getByRole('button', { name: 'New lead' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /create lead|save|add lead/i }).click();
    await expect(dialog.getByText('Lead name is required.')).toBeVisible();
    await expect(dialog.locator('#lead-name')).toBeFocused();

    await dialog.locator('#lead-name').fill('E2E Sample Prospect');
    await dialog.getByRole('button', { name: /create lead|save|add lead/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Lead created.')).toBeVisible();
    await expect(page.locator('main').getByText('E2E Sample Prospect')).toBeVisible();
  });

  test('changing a lead status records it in the history', async ({ page }) => {
    await open(page, '/leads/lead-2');
    await page.locator('#lead-status').selectOption('INTERESTED');
    await page.getByRole('button', { name: 'Update status' }).click();
    await expect(page.locator('main .badge', { hasText: 'Interested' }).first()).toBeVisible();
  });
});

test.describe('tasks', () => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    test(`the task filters fit one row beside a scope-and-view row at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, '/tasks');
      const top = async (selector: string) => Math.round((await page.locator(selector).boundingBox())!.y);
      const fieldTops = new Set(await Promise.all(['#task-search', '#task-filter', '#task-priority-filter', '#task-type-filter'].map(top)));
      expect(fieldTops.size).toBe(1);
      expect(await top('[aria-label="Task view"]')).toBe(await top('[aria-label="Task scope"]'));
      // The work starts on the first screen at tablet and laptop sizes.
      await expect(page.locator('.kanban-card').first()).toBeInViewport();
    });
  }

  test('filtering and switching view still work after the toolbar moved', async ({ page }) => {
    await open(page, '/tasks');
    await page.locator('#task-filter').selectOption('IN_REVIEW');
    await expect(page.locator('.kanban-card')).toHaveCount(1);
    await expect(page.locator('.kanban-card')).toContainText('Revise launch carousel CTA');
    await page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.data-table')).toContainText('Revise launch carousel CTA');
    // Own lists have no board or table: the view switch goes with them.
    await page.getByRole('group', { name: 'Task scope' }).getByRole('button', { name: 'My drafts' }).click();
    await expect(page.getByRole('group', { name: 'Task view' })).toHaveCount(0);
  });

  test('a draft is saved privately, then published onto the board', async ({ page }) => {
    await open(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#task-title').fill('E2E draft task');
    await dialog.getByRole('checkbox', { name: 'Reels' }).check();
    await dialog.getByRole('checkbox', { name: 'Other' }).check();
    // OTHER needs its text: the form refuses until it is given.
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog.getByText('Say what the other type of work is.')).toBeVisible();
    await dialog.getByLabel('What kind of work is it?').fill('Event setup');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog).toBeHidden();

    // Not on the board while it is a draft.
    await expect(page.locator('.kanban-card', { hasText: 'E2E draft task' })).toHaveCount(0);

    await page.getByRole('button', { name: 'My drafts' }).click();
    const row = page.locator('.draft-row', { hasText: 'E2E draft task' });
    await expect(row.getByText('Event setup')).toBeVisible();
    await row.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('“E2E draft task” is now a task.')).toBeVisible();

    await page.getByRole('button', { name: 'All tasks' }).click();
    await expect(page.locator('.kanban-card', { hasText: 'E2E draft task' })).toBeVisible();
  });

  test('starting work stamps the start time and notifies', async ({ page }) => {
    await open(page, '/tasks/task-3');
    await page.locator('#task-status').selectOption('IN_PROGRESS');
    await expect(page.getByText('Task moved to In Progress.')).toBeVisible();
    await expect(page.locator('.key-values > div', { hasText: 'Started' })).toBeVisible();
  });

  test('editing a task replaces its types', async ({ page }) => {
    await open(page, '/tasks/task-3');
    // Exact: the task page also has "Edit people" / "Edit steps".
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: 'Design' }).check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.key-values > div', { hasText: 'Type' }).getByText('Design')).toBeVisible();
  });
});

test.describe('approvals', () => {
  // Demo data lives in memory: a full reload resets it, so outcomes are checked in-app, never via page.goto.
  test('approving from the queue confirms and removes the task', async ({ page }) => {
    await open(page, '/approvals');
    const row = page.locator('main').getByText('Revise launch carousel CTA');
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).first().click();
    // task-1 is a two-step flow: approving step 1 hands it to the next person.
    await expect(page.getByText('Step approved. Demo User has been told it is their turn.')).toBeVisible();
    await expect(row).toBeHidden();
  });

  test('requesting changes cannot be sent without a note', async ({ page }) => {
    await open(page, '/approvals');
    await page.getByRole('button', { name: 'Request changes' }).first().click();
    const dialog = page.getByRole('dialog');
    const send = dialog.getByRole('button', { name: 'Send back' });
    await expect(send).toBeDisabled();
    await dialog.locator('textarea').fill('Make the CTA bigger.');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Sent back to /)).toBeVisible();
    await expect(page.locator('main').getByText('Revise launch carousel CTA')).toBeHidden();
  });
});

test.describe('notifications', () => {
  test('on a short landscape phone the panel shrinks its list, keeping both ends on screen', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await open(page, '/my-work');
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const panel = page.getByRole('region', { name: 'Recent notifications' });
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(568);
    expect(box!.y + box!.height).toBeLessThanOrEqual(320);
    await expect(panel.getByRole('button', { name: 'View all notifications' })).toBeInViewport();
  });

  test('mark all read clears the unread count', async ({ page }) => {
    await open(page, '/notifications');
    await expect(page.getByRole('button', { name: /Notifications, \d+ unread/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  });

  test('a task notification opens its task', async ({ page }) => {
    await open(page, '/notifications');
    await page.locator('main').getByText('New task assigned').first().click();
    await expect(page).toHaveURL(/\/tasks\//);
  });

  const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'phone', width: 375, height: 812 },
    { name: 'small phone', width: 320, height: 640 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`the bell panel works from the keyboard (${viewport.name})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, '/my-work');
      const bell = page.getByRole('button', { name: /^Notifications/ });
      await bell.focus();
      await page.keyboard.press('Enter');

      // A labelled region that takes focus, not an empty "menu".
      const panel = page.getByRole('region', { name: 'Recent notifications' });
      await expect(panel).toBeFocused();
      await expect(bell).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('menu')).toHaveCount(0);
      // The whole panel on screen, both edges, and the topbar not pushed sideways.
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      await expect(panel.getByRole('button', { name: 'Mark all read' })).toBeInViewport();
      await expect(panel.getByRole('button', { name: 'View all notifications' })).toBeInViewport();

      // Escape closes it and puts focus back on the bell.
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(bell).toBeFocused();

      // Reopen, Tab to the first notification, Enter opens what it is about.
      await page.keyboard.press('Enter');
      await expect(panel).toBeFocused();
      await page.keyboard.press('Tab'); // Mark all read
      await page.keyboard.press('Tab'); // first notification
      await expect(panel.locator('.notification-item').first().getByRole('button')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(panel).toBeHidden();
      await expect(page).not.toHaveURL(/\/my-work$/);
    });
  }
});

test.describe('automations', () => {
  test('pausing and resuming a rule gives feedback each way', async ({ page }) => {
    await open(page, '/automations');
    const toggle = page.locator('main').getByRole('switch').first();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.getByText(/is paused\./)).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(page.getByText(/is (on|active|resumed)/i)).toBeVisible();
    await expect(toggle).toBeChecked();
  });
});

test.describe('members', () => {
  test('an invitation carries one role and returns a link', async ({ page }) => {
    await open(page, '/members');
    await page.getByRole('button', { name: 'Invite member' }).click();
    const dialog = page.getByRole('dialog');
    // A single select, not a checklist: the API takes exactly one `role`.
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await dialog.getByLabel('Full name').fill('E2E Invitee');
    await dialog.getByLabel('Email').fill('e2e-invitee@example.test');
    await dialog.getByLabel('Role').selectOption('ART_DIRECTOR');
    await dialog.getByRole('button', { name: 'Create invitation' }).click();
    await expect(dialog.getByText('Share this link now')).toBeVisible();
  });


  test('roles open for editing on demand and suspending asks first', async ({ page }) => {
    await open(page, '/members');
    await expect(page.locator('.role-checklist')).toHaveCount(0);
    await page.getByRole('button', { name: 'Change roles for Demo Designer' }).click();
    await expect(page.locator('.role-checklist')).toHaveCount(1);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('row', { name: /Client Reviewer/ }).getByRole('button', { name: 'Suspend' }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm.getByText(/lose access/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row', { name: /Client Reviewer/ }).getByText('Active')).toBeVisible();
  });
});
