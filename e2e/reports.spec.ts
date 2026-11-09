import {expect, test, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs} from './helpers';

/**
 * Reports and blocks (2026-11-09 §9): a Report action on a listing and a
 * profile; the Reports tab on /admin for reviewers, with resolve actions;
 * a hidden listing leaves the board. Each test failed on the old build.
 */

const rhea = (info: TestInfo) =>
  `rhea-reports-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;

test('a person reports a listing with a reason; a reviewer hides it; it leaves the public board', async ({
  page,
  browser,
}, info) => {
  // A listing of its own, so the board tests never miss one.
  const made = await page.request.post(`${MOCK_API}/__test/clone/listing/lst-view`);
  const listingId = ((await made.json()) as {id: string}).id;

  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/listing/${listingId}`);
  await page.getByRole('button', {name: 'Report'}).click();
  const form = page.getByRole('form', {name: 'Report this listing'});
  await expect(form.getByLabel(/Why are you reporting/)).toBeFocused();
  await form.getByRole('button', {name: 'Send the report'}).click();
  await expect(form.getByText('Choose a reason.')).toBeVisible();
  await form.getByLabel(/Why are you reporting/).selectOption('scam');
  await form.getByLabel('Details (optional)').fill('Asks for payment outside the escrow.');
  await form.getByRole('button', {name: 'Send the report'}).click();
  await expect(page.getByTestId('report-sent')).toBeVisible();

  const desk = await browser.newContext();
  const reviewer = await desk.newPage();
  await signInAs(reviewer, rhea(info));
  await reviewer.goto('/admin');
  await reviewer.getByRole('tab', {name: 'Reports'}).click();
  const report = reviewer
    .getByRole('list', {name: 'Reports'})
    .getByRole('listitem')
    .filter({hasText: listingId});
  await expect(report).toContainText('scam');
  await expect(report).toContainText('outside the escrow');
  await report.getByRole('button', {name: 'Hide'}).click();
  // A note is required: an empty one is refused before the API.
  await report.getByRole('button', {name: /Confirm: Hide/}).click();
  await expect(report.getByRole('alert')).toContainText('3-500');
  await report.getByLabel('Note (3-500 characters)').fill('Payment outside the escrow is a scam pattern.');
  await report.getByRole('button', {name: /Confirm: Hide/}).click();
  await expect(report).toHaveCount(0);
  await reviewer.getByRole('button', {name: 'Resolved'}).click();
  await expect(
    reviewer.getByRole('list', {name: 'Reports'}).getByRole('listitem').filter({hasText: listingId}),
  ).toContainText('Resolved: hide');
  await desk.close();

  // Hidden: gone from the board; its page says so to the owner.
  await page.goto(`/jobs/listing/${listingId}`);
  await expect(page.getByText('hidden by moderation')).toBeVisible();
  const res = await page.request.get(`${MOCK_API}/v1/listings?limit=100`);
  const ids = ((await res.json()) as {listings: {listingId: string}[]}).listings.map((l) => l.listingId);
  expect(ids).not.toContain(listingId);
});

test('a profile can be reported too, and the reports tab is for reviewers only', async ({page}, info) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/people/dddddddd-0000-4000-8000-000000000001');
  await page.getByRole('button', {name: 'Report'}).click();
  await page.getByLabel(/Why are you reporting/).selectOption('impersonation');
  await page.getByRole('button', {name: 'Send the report'}).click();
  await expect(page.getByTestId('report-sent')).toBeVisible();

  const cara = `cara-reports-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  await signInAs(page, cara);
  await page.goto('/admin');
  await expect(page.getByRole('tab', {name: 'Reports'})).toHaveCount(0);
});

test('the reports tab passes an accessibility scan', async ({page}, info) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await signInAs(page, rhea(info));
  await page.goto('/admin');
  await page.getByRole('tab', {name: 'Reports'}).click();
  await expect(page.getByRole('group', {name: 'Report status'})).toBeVisible();
  await expectNoBlockingViolations(page, 'admin reports');
});
