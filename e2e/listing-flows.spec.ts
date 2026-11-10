import {expect, test, type Page, type Route, type TestInfo} from '@playwright/test';
import {methods, MOCK_API, signInAs, txs} from './helpers';

/**
 * Listing flows after the 2026-11-10 audit (items 3, 7, 8, 9 and the bid
 * wording of 15): a job declined before funding offers no funding; someone
 * who cannot be hired cannot bid or claim, and the owner sees which bidders
 * cannot be hired; a selection never funded is shown as needing funding after
 * a reload and can be released; a listing past its deadline offers no
 * reopen; /jobs/new without a person record shows the join step, not a form.
 * Each test failed on the build before these changes.
 */

const who = (prefix: string, info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;

async function freshPerson(page: Page, info: TestInfo, prefix: string): Promise<string> {
  const account = who(prefix, info);
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  expect((await page.request.post(`${MOCK_API}/__test/standing/${account}/clear`)).ok()).toBe(true);
  return account;
}

async function fresh(page: Page, kind: 'listing' | 'job', template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/${kind}/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

const json = (route: Route, body: unknown) =>
  route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

/** The NEAR RPC: `stake_of` says whether the person's record can be hired. */
async function mockStake(page: Page, hireable: boolean) {
  await page.route('https://rpc.testnet.near.org/**', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const answer =
      body.params?.method_name === 'stake_of'
        ? {available: '0', pending: '0', unlock_at: 0, locked: '0', unlocked: '0', hireable}
        : null;
    return json(route, {
      jsonrpc: '2.0',
      id: body.id,
      result: {result: Array.from(new TextEncoder().encode(JSON.stringify(answer))), logs: []},
    });
  });
}

// ── item 3 ─────────────────────────────────────────────────────────────────

test('a job its worker declined before funding offers its client no funding, and says what to do', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', 'aaaaaaaa-0000-4000-8000-000000000018')}`);
  await expect(page.getByRole('heading', {name: 'The worker declined'})).toBeVisible();
  await expect(page.getByText('Declined before funding').first()).toBeVisible();
  await expect(page.getByText(/pick another bid/).first()).toBeVisible();
  await expect(page.getByRole('button', {name: /Sign and fund/})).toHaveCount(0);
});

// ── item 7 ─────────────────────────────────────────────────────────────────

test('someone who is not hireable cannot bid, is told why, and gets a link to add stake', async ({
  page,
}, info) => {
  const account = await freshPerson(page, info, 'nohire');
  await mockStake(page, false);
  await signInAs(page, account);
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-apply')}`);
  const why = page.getByTestId('bid-not-ready');
  await expect(why).toContainText('not hireable yet');
  await expect(why.getByRole('link', {name: /Add stake/})).toHaveAttribute('href', '/agents/177/manage');
  await expect(page.getByRole('button', {name: 'Send my bid'})).toBeDisabled();
});

test('someone on hold cannot claim a slot, and is told why', async ({page}, info) => {
  const account = await freshPerson(page, info, 'held');
  await page.request.post(`${MOCK_API}/__test/standing/${account}/hold`);
  await mockStake(page, true);
  await signInAs(page, account);
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-instant')}`);
  await expect(page.getByTestId('bid-not-ready')).toContainText('on hold');
  await expect(page.getByRole('button', {name: 'Claim a slot'})).toBeDisabled();
});

test('a hireable person in good standing can still bid', async ({page}, info) => {
  const account = await freshPerson(page, info, 'ready');
  await mockStake(page, true);
  await signInAs(page, account);
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-apply')}`);
  await expect(page.getByRole('button', {name: 'Send my bid'})).toBeEnabled();
  await expect(page.getByTestId('bid-not-ready')).toHaveCount(0);
});

test('the owner sees which bidders cannot be hired yet, and which are on hold', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-flags')}`);
  const shown = page.getByTestId(page.viewportSize()!.width >= 768 ? 'bid-row' : 'bid-card');
  await expect(shown.filter({hasText: 'Wade'})).toContainText('Not hireable yet');
  await expect(shown.filter({hasText: 'Nora'})).toContainText('On hold');
  await expect(shown.filter({hasText: 'Nora'})).not.toContainText('Not hireable yet');
});

// ── item 8 ─────────────────────────────────────────────────────────────────

async function select(page: Page, name: string) {
  await page.getByRole('button', {name: `Select ${name}`}).click();
  await page.getByLabel(/^Why/).fill('Closest to the shop and the best price.');
  await page.getByRole('button', {name: 'Confirm selection'}).click();
  await expect(page.getByRole('heading', {name: 'Fund the job'})).toBeVisible();
}

test('owner: a selection never funded still shows as needing funding after a reload, and can be funded', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-fund')}`);
  await select(page, 'Wade');
  await page.reload();
  const slots = page.getByRole('list', {name: 'Slots'});
  await expect(slots).toContainText('Needs funding');
  await slots.getByRole('button', {name: 'Sign and fund slot 1'}).click();
  await expect(page.getByTestId('funded-by-wallet')).toBeVisible();
  expect(await methods(page)).toEqual(['create_job']);
});

test('owner: a selection never funded can be released, and the slot and the bids come back', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-fund')}`);
  await select(page, 'Wade');
  await page.reload();
  await page.getByRole('button', {name: 'Release slot 1'}).click();
  await expect(page.getByTestId('released')).toContainText('released');
  const slots = page.getByRole('list', {name: 'Slots'});
  await expect(slots).not.toContainText('Needs funding');
  await expect(page.getByText('0 of 1 filled').first()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Select Nora'}).first()).toBeAttached();
  expect(await txs(page)).toHaveLength(0);
});

test('owner: a listing past its deadline offers no reopen, and says why', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-expired')}`);
  await expect(page.getByTestId('manage-help')).toContainText('deadline has passed');
  await expect(page.getByRole('button', {name: 'Reopen'})).toHaveCount(0);
});

test('owner: a filled listing is not told it can still stop hiring', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-allfilled')}`);
  await expect(page.getByTestId('manage-help')).toContainText('Every slot is taken');
  await expect(page.getByTestId('manage-help')).not.toContainText('still stop hiring');
});

test('owner: one page of bids shows no pagination', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-reject')}`);
  await expect(page.getByText('2 bids')).toBeVisible();
  await expect(page.getByRole('navigation', {name: 'Bid pages'})).toHaveCount(0);
});

// ── item 9 ─────────────────────────────────────────────────────────────────

test('/jobs/new without a person record shows the join step and no form', async ({page}, info) => {
  await signInAs(page, who('noperson', info));
  await page.goto('/jobs/new');
  await expect(page.getByTestId('join-first')).toBeVisible();
  await expect(page.getByTestId('join-first').getByRole('link', {name: 'Join as a person'})).toHaveAttribute(
    'href',
    '/join',
  );
  await expect(page.getByRole('button', {name: 'Post the listing'})).toHaveCount(0);
  await expect(page.getByLabel('Title', {exact: true})).toHaveCount(0);
});

// ── item 15: the words ─────────────────────────────────────────────────────

test('badges say what a listing is in words, and bids are called bids', async ({page}) => {
  await page.goto('/jobs/listing/lst-view');
  const header = page.locator('header').filter({has: page.getByRole('heading', {level: 1})});
  await expect(header.getByText('Open', {exact: true})).toBeVisible();
  await expect(header.getByText('Physical work', {exact: true})).toBeVisible();
  await expect(header.getByText('Photos', {exact: true})).toBeVisible();
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-reject')}`);
  if (page.viewportSize()!.width >= 768)
    await expect(page.getByRole('columnheader', {name: 'Bidder'})).toBeVisible();
  await expect(page.getByRole('columnheader', {name: 'Applicant'})).toHaveCount(0);
});
