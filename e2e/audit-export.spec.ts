import {expect, test, type TestInfo} from '@playwright/test';
import {signInAs} from './helpers';

/**
 * The reviewers' audit-log export on /admin (Round 3, 2026-11-09):
 * GET /v1/admin/audit-log.csv for a date range, the last day included.
 */

const reviewer = (info: TestInfo) =>
  `rhea-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;

test.describe('the compliance audit-log export', () => {
  test('a reviewer downloads the CSV for the dates chosen, the last day included', async ({page}, info) => {
    await signInAs(page, reviewer(info));
    await page.goto('/admin');
    await page.getByRole('tab', {name: 'Compliance'}).click();
    const form = page.getByRole('form', {name: 'Export audit log'});
    await form.getByLabel('From').fill('2026-10-01');
    await form.getByLabel('To (included)').fill('2026-10-31');
    const asked = page.waitForRequest((r) => r.url().includes('/v1/admin/audit-log.csv'));
    const download = page.waitForEvent('download');
    await form.getByRole('button', {name: 'Export audit log (CSV)'}).click();
    const url = new URL((await asked).url());
    expect(url.searchParams.get('from')).toBe('2026-10-01');
    expect(url.searchParams.get('to')).toBe('2026-11-01');
    const file = await download;
    expect(file.suggestedFilename()).toBe('pactora-audit-2026-10-01-2026-11-01.csv');
    const path = await file.path();
    const {readFileSync} = await import('node:fs');
    expect(readFileSync(path, 'utf8').split('\n')[0]).toBe(
      'at,kind,action,case_id,reviewer,subject_account,outcome,note',
    );
  });

  test('a range the API would refuse is refused on the page, without asking', async ({page}, info) => {
    await signInAs(page, reviewer(info));
    await page.goto('/admin');
    await page.getByRole('tab', {name: 'Compliance'}).click();
    const form = page.getByRole('form', {name: 'Export audit log'});
    let asked = false;
    page.on('request', (r) => {
      if (r.url().includes('/v1/admin/audit-log.csv')) asked = true;
    });
    await form.getByLabel('From').fill('2026-11-09');
    await form.getByLabel('To (included)').fill('2026-11-01');
    await form.getByRole('button', {name: 'Export audit log (CSV)'}).click();
    await expect(form.getByRole('alert')).toContainText('on or after');
    expect(asked).toBe(false);
  });

  test('a council member who is not a reviewer has no export', async ({page}, info) => {
    await signInAs(
      page,
      `cara-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`,
    );
    await page.goto('/admin');
    await expect(page.getByTestId('admin-roles')).toContainText('Arbiter council');
    await expect(page.getByRole('button', {name: 'Export audit log (CSV)'})).toHaveCount(0);
  });
});
