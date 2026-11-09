import {expect, test, type Page} from '@playwright/test';
import {expectNoBlockingViolations, methods, MOCK_API, signers, signInAs, txs} from './helpers';

/**
 * The job board in a real browser: the board, posting, bidding, the owner's
 * controls, a job's actions, and /me.
 *
 * The API is the mock (e2e/mock-api.mjs), the wallet is scripted (see
 * helpers.ts). Every test that changes something works on a fixture of its
 * own, so the tests can run in parallel; what the mock knows is declared there
 * (olive posts listings, wade works, nora is a bystander, mia has a history,
 * sam has no person record).
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * A fresh copy of one of the mock's fixtures, with an id of its own. The three
 * browsers of E2E_ALL_BROWSERS share one mock server, so a test that changes
 * something must not use a fixture another run has already changed.
 */
async function fresh(page: Page, kind: 'listing' | 'job', template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/${kind}/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

const cards = (page: Page) => page.getByRole('list', {name: 'Listings'}).getByRole('article');

// ── the board ──────────────────────────────────────────────────────────────

test('the board filters on the server, shows the ceiling and what the worker receives, and pages by cursor', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/v1/listings') asked.push(new URL(r.url()).search);
  });
  await page.goto('/jobs');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Work on offer');
  const skilled = page.waitForResponse((r) => r.url().includes('skill=boardtest'));
  await page.getByLabel('Skill', {exact: true}).fill('boardtest');
  await skilled;
  await expect(cards(page)).toHaveCount(12);
  const first = cards(page).first();
  await expect(first).toContainText('Up to 5 USDC');
  await expect(first).toContainText('Worker receives 4.95 USDC after the fee');
  await expect(first.getByRole('link')).toHaveAttribute('href', /^\/jobs\/listing\/lst-board-/);

  await page.getByRole('button', {name: 'Load more'}).click();
  await expect(cards(page)).toHaveCount(14);
  await expect(page.getByRole('button', {name: 'Load more'})).toHaveCount(0);
  await expect(page.getByText('That is every open listing that matches.')).toBeVisible();
  // The second page was asked for with the cursor the first one gave.
  expect(asked.some((q) => q.includes('cursor=lst-board-03') && q.includes('skill=boardtest'))).toBe(true);

  await page.getByLabel('Category', {exact: true}).selectOption({label: 'Judgment'});
  await expect(cards(page)).toHaveCount(2);
  expect(asked.at(-1)).toContain('category=judgment');

  await page.getByLabel('Category', {exact: true}).selectOption({label: 'Any'});
  await page.getByLabel('Location', {exact: true}).fill('Mumbai');
  await expect(cards(page)).toHaveCount(5);
  expect(asked.at(-1)).toContain('location=Mumbai');

  const conversational = page.waitForResponse((r) => r.url().includes('interactionMode=conversation'));
  await page.getByLabel('How it is done', {exact: true}).selectOption({label: 'Conversation'});
  await conversational;
  await expect(cards(page)).toHaveCount(3);
  expect(asked.at(-1)).toContain('interactionMode=conversation');

  await page.getByLabel('Skill', {exact: true}).fill('no-such-skill');
  await expect(page.getByText('No listings match these filters')).toBeVisible();
});

test('"Matches me" needs a sign-in and asks the API to match the person', async ({page}) => {
  await page.goto('/jobs');
  await expect(page.getByLabel('Matches me')).toBeDisabled();
  await expect(page.getByText('Sign in to see only the listings that fit')).toBeVisible();

  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs');
  const asked: {search: string; auth: string | undefined}[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/v1/listings')
      asked.push({search: new URL(r.url()).search, auth: r.headers()['authorization']});
  });
  await page.getByLabel('Skill', {exact: true}).fill('matchtest');
  await expect(cards(page)).toHaveCount(2);
  await page.getByLabel('Matches me').check();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Fits a photographer');
  const last = asked.at(-1)!;
  expect(last.search).toContain('match=me');
  expect(last.auth).toMatch(/^Bearer ps_olive\.testnet_/);
});

// ── posting ────────────────────────────────────────────────────────────────

async function fillListing(page: Page, over: Partial<Record<string, string>> = {}) {
  const v = {
    title: 'Photograph the bakery sign',
    description: 'Two photos of the bakery sign on 3rd Street, in daylight.',
    category: 'Physical',
    mode: 'Capture',
    skills: 'photography, ZZ create',
    location: 'Pune',
    criteria: 'Both photos are sharp and show the whole sign.',
    price: '2.5',
    workers: '3',
    minutes: '45',
    deadline: '2031-01-01T12:00',
    ...over,
  };
  await page.getByLabel('Title', {exact: true}).fill(v.title);
  await page.getByLabel('Description', {exact: true}).fill(v.description);
  await page.getByLabel('Category', {exact: true}).selectOption({label: v.category});
  await page.getByLabel('How it is done', {exact: true}).selectOption({label: v.mode});
  await page.getByLabel('Skills (optional)').fill(v.skills);
  await page.getByLabel('Location (optional)').fill(v.location);
  await page.getByLabel('Acceptance criteria').fill(v.criteria);
  await page.getByLabel(/Most you pay one worker/).fill(v.price);
  await page.getByLabel('Workers needed').fill(v.workers);
  await page.getByLabel('Estimated effort (minutes)').fill(v.minutes);
  await page.getByLabel('Listing deadline').fill(v.deadline);
}

test('posting a listing: mistakes are said beside the fields, then the listing is posted and shown to its owner', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Post a listing');

  await page.getByRole('button', {name: 'Post the listing'}).click();
  await expect(page.getByText('The title is at least 5 characters (now 0).')).toBeVisible();
  await expect(page.getByText('Choose a category.')).toBeVisible();
  await expect(page.getByText('Enter the most you will pay one worker.')).toBeVisible();
  await expect(page.getByLabel('Title', {exact: true})).toBeFocused();

  await fillListing(page, {price: '2.5', title: 'Photograph the bakery sign'});
  await page.getByLabel('Time to do the work (minutes, optional)').fill('301');
  await page.getByRole('button', {name: 'Post the listing'}).click();
  await expect(page.getByText(/At most 300 minutes \(5 hours\): the testnet contract refuses/)).toBeVisible();

  const posted = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/v1/listings',
  );
  await page.getByLabel('Time to do the work (minutes, optional)').fill('240');
  await page.getByRole('button', {name: 'Post the listing'}).click();
  const request = await posted;
  const body = request.postDataJSON();
  expect(body).toMatchObject({
    title: 'Photograph the bakery sign',
    category: 'physical',
    interactionMode: 'capture',
    skills: ['photography', 'zz create'],
    location: 'Pune',
    maxPriceBaseUnits: '2500000',
    maxWorkers: 3,
    hiringMode: 'applications',
    estimatedMinutes: 45,
    workWindowSeconds: 14400,
  });
  expect(body.deadline).toMatch(/^2031-01-01T\d\d:\d\d:00\.000Z$/);
  expect(request.headers()['idempotency-key']).toMatch(/\S{8,}/);
  expect(request.headers()['authorization']).toMatch(/^Bearer ps_olive\.testnet_/);

  await expect(page).toHaveURL(/\/jobs\/listing\/lst-new-/);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Photograph the bakery sign');
  // The API says this viewer owns it, so the controls are shown.
  await expect(page.getByRole('heading', {name: 'Manage this listing'})).toBeVisible();
});

test('pressing Post again after a dropped answer reuses the draft’s key and posts it once', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  const keys: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/v1/listings')
      keys.push(r.headers()['idempotency-key'] ?? '');
  });
  const title = `FLAKY once please ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fillListing(page, {title});
  await page.getByRole('button', {name: 'Post the listing'}).click();
  await expect(page.getByText('The listing was not posted')).toBeVisible();
  await expect(page.getByText(/may not have received it, or may have posted it/)).toBeVisible();
  await page.getByRole('button', {name: 'Post the listing'}).click();
  await expect(page).toHaveURL(/\/jobs\/listing\/lst-new-/);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const created = await (await page.request.get(`${MOCK_API}/__test/created`)).json();
  expect(created[title]).toBe(1);
});

test('posting says what the API refused, in its own words', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  await fillListing(page, {title: `BROKE and posting ${Date.now()}`});
  await page.getByRole('button', {name: 'Post the listing'}).click();
  // The API's words, without its code (M9).
  await expect(page.getByRole('alert').filter({hasText: 'daily allowance'})).toContainText('cannot reserve');
  await expect(page.getByText(/INSUFFICIENT_FUNDS/)).toHaveCount(0);
  await expect(page).toHaveURL(/\/jobs\/new$/);
});

test('posting needs a sign-in and a person record', async ({page}) => {
  await page.goto('/jobs/new');
  await expect(page.getByRole('heading', {name: 'Sign in first'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Post the listing'})).toHaveCount(0);
  await signInAs(page, 'sam.testnet');
  await page.goto('/jobs/new');
  await expect(page.getByText('Posting needs a person record on Pactora.')).toBeVisible();
});

// ── bidding ────────────────────────────────────────────────────────────────

test('an applicant sees the ceiling, bids, sees the bid, and withdraws it', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-apply')}`);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Bid on me');
  await expect(page.getByText('Up to 5 USDC')).toBeVisible();
  await expect(page.getByText('Worker receives 4.95 USDC after the fee')).toBeVisible();

  await page.getByLabel(/Your price/).fill('6');
  await page.getByLabel('Your proposal').fill('short');
  await page.getByRole('button', {name: 'Send my bid'}).click();
  await expect(page.getByText('Your price is above the listing’s ceiling.')).toBeVisible();
  await expect(page.getByText('Your proposal is at least 20 characters (now 5).')).toBeVisible();

  await page.getByLabel(/Your price/).fill('3.5');
  await page.getByLabel('Your proposal').fill('I can shoot it on Tuesday morning with a good camera.');
  await page.getByRole('button', {name: 'Send my bid'}).click();
  const bid = page.getByTestId('my-bid');
  await expect(bid).toContainText('3.5 USDC');
  await expect(bid).toContainText('pending');
  await expect(bid).toContainText('You would receive 3.465 USDC after the fee');
  // One live bid at a time: the form is replaced by why.
  await expect(page.getByTestId('bid-blocked')).toContainText('Withdraw it to change your price');
  await expect(page.getByRole('button', {name: 'Send my bid'})).toHaveCount(0);

  await page.getByRole('button', {name: 'Withdraw this bid'}).click();
  await page.getByRole('button', {name: 'Confirm withdrawal'}).click();
  await expect(bid).toContainText('withdrawn');
  await expect(page.getByRole('button', {name: 'Send my bid'})).toBeVisible();
  await expect(page.getByText('1 of 3 bids used on this listing.')).toBeVisible();
});

test('an applicant with a bid waiting can withdraw it', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-withdraw')}`);
  await expect(page.getByTestId('my-bid')).toContainText('3 USDC');
  await page.getByRole('button', {name: 'Withdraw this bid'}).click();
  await page.getByRole('button', {name: 'Confirm withdrawal'}).click();
  await expect(page.getByTestId('my-bid')).toContainText('withdrawn');
});

test('after three bids the form says the limit is reached', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto('/jobs/listing/lst-limit');
  await expect(page.getByTestId('bid-blocked')).toContainText('all 3 bids you may make on one listing');
  await expect(page.getByRole('button', {name: 'Send my bid'})).toHaveCount(0);
  await expect(page.getByTestId('my-bid')).toHaveCount(3);
});

test('instant hiring: one button takes a slot and leads to the job', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-instant')}`);
  await page.getByRole('button', {name: 'Claim a slot'}).click();
  await expect(page.getByRole('status').filter({hasText: 'You have a slot.'})).toBeVisible();
  await page.getByRole('link', {name: 'Open your job'}).click();
  await expect(page).toHaveURL(/\/jobs\/bbbbbbbb-/);
  await expect(page.getByTestId('state-plain')).toContainText('not on chain yet');
});

test('a visitor sees the listing and is asked to sign in; a person-less account is asked to join', async ({
  page,
}) => {
  await page.goto('/jobs/listing/lst-view');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Photograph a shopfront');
  await expect(page.getByRole('link', {name: 'Sign in'}).last()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Send my bid'})).toHaveCount(0);
  await signInAs(page, 'sam.testnet');
  await page.goto('/jobs/listing/lst-view');
  await expect(page.getByRole('link', {name: 'Join as a person'}).last()).toBeVisible();
});

// ── the owner ──────────────────────────────────────────────────────────────

async function decide(page: Page, who: string, action: 'Select' | 'Reject', reason: string) {
  await page.getByRole('button', {name: `${action} ${who}`}).click();
  await page.getByLabel(/^Why/).fill(reason);
  await page
    .getByRole('button', {name: action === 'Select' ? 'Confirm selection' : 'Confirm rejection'})
    .click();
}

test('owner: selecting a bid on a person’s listing asks the person’s wallet to fund the job', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-fund')}`);
  await expect(page.getByTestId('bid-row')).toHaveCount(2);

  await page.getByRole('button', {name: 'Select Nora'}).click();
  await page.getByLabel(/^Why/).fill('too short');
  await page.getByRole('button', {name: 'Confirm selection'}).click();
  await expect(page.getByText('The reason is at least 10 characters (now 9).')).toBeVisible();
  await page.getByLabel(/^Why/).fill('Closest to the shop and the best price.');
  await page.getByRole('button', {name: 'Confirm selection'}).click();

  await expect(page.getByRole('heading', {name: 'Fund the job'})).toBeVisible();
  expect(await txs(page)).toHaveLength(0);
  await page.getByRole('button', {name: 'Sign and fund the job'}).click();
  await expect(page.getByTestId('funded-by-wallet')).toBeVisible();
  expect(await methods(page)).toEqual(['create_job']);
  expect(await signers(page)).toEqual(['olive.testnet']);
  // The slot now points at the job.
  await expect(
    page.getByRole('list', {name: 'Slots'}).getByRole('link', {name: 'Open the job'}),
  ).toBeVisible();
  await expect(page.getByText('1 of 1 filled').first()).toBeVisible();
});

test('owner: selecting a bid on an agent-funded listing shows the signer’s transaction and asks for nothing', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-signer')}`);
  await decide(page, 'Wade', 'Select', 'Best price and a good record.');
  const done = page.getByTestId('funded-by-signer');
  await expect(done).toContainText('Your agent’s signer funded the job');
  await expect(done.getByRole('link', {name: 'transaction'})).toHaveAttribute(
    'href',
    'https://testnet.nearblocks.io/txns/SIGNERTX1',
  );
  await expect(page.getByRole('heading', {name: 'Fund the job'})).toHaveCount(0);
  expect(await txs(page)).toHaveLength(0);
});

test('owner: rejecting a bid records the reason', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-reject')}`);
  await decide(page, 'Wade', 'Reject', 'Too far away from the shop.');
  const row = page.getByTestId('bid-row').filter({hasText: 'Wade'});
  await expect(row).toContainText('rejected');
  await expect(row).toContainText('Too far away from the shop.');
  await expect(page.getByRole('button', {name: 'Select Wade'})).toHaveCount(0);
});

test('owner: the bids sort and page, twenty at a time', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/listing/lst-own-page');
  await expect(page.getByTestId('bid-row')).toHaveCount(20);
  await expect(page.getByTestId('bid-page')).toHaveText('Page 1 of 2');
  await expect(page.getByTestId('bid-row').first()).toContainText('Bidder 25');
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(page.getByTestId('bid-row')).toHaveCount(5);
  await expect(page.getByTestId('bid-page')).toHaveText('Page 2 of 2');
  await expect(page.getByRole('button', {name: 'Next'})).toBeDisabled();

  await page.getByLabel('Sort bids').selectOption({label: 'Price, low to high'});
  await expect(page.getByTestId('bid-page')).toHaveText('Page 1 of 2');
  await expect(page.getByTestId('bid-row').first()).toContainText('Bidder 25');
  await expect(page.getByTestId('bid-row').first()).toContainText('1 USDC');
  await page.getByLabel('Sort bids').selectOption({label: 'Price, high to low'});
  await expect(page.getByTestId('bid-row').first()).not.toContainText('Bidder 25');
});

test('owner: stop hiring, reopen, edit and cancel', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-close')}`);
  await page.getByRole('button', {name: 'Stop hiring'}).click();
  await expect(page.getByRole('button', {name: 'Reopen'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Select Wade'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Reopen'}).click();
  await expect(page.getByRole('button', {name: 'Stop hiring'})).toBeVisible();

  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-edit')}`);
  await page.getByRole('button', {name: 'Edit', exact: true}).click();
  await page.getByLabel('Title', {exact: true}).fill('A better title for this');
  await page.getByRole('button', {name: 'Save changes'}).click();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('A better title for this');

  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-cancel')}`);
  await page.getByRole('button', {name: 'Cancel listing'}).click();
  await page.getByRole('button', {name: /Yes, cancel it/}).click();
  await expect(page.getByText('cancelled', {exact: true}).first()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Cancel listing'})).toHaveCount(0);
});

test('owner: once someone is chosen the listing cannot be edited or cancelled, and the slot links to the job', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/listing/lst-own-filled');
  await expect(page.getByRole('button', {name: 'Edit', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Cancel listing'})).toBeDisabled();
  await expect(
    page.getByText(/You have chosen a worker, so the listing can no longer be edited/),
  ).toBeVisible();
  await expect(
    page.getByRole('list', {name: 'Slots'}).getByRole('link', {name: 'Open the job'}),
  ).toHaveAttribute('href', '/jobs/bbbbbbbb-0000-4000-8000-00000000f001');
});

test('someone else’s listing shows no owner controls', async ({page}) => {
  await signInAs(page, 'nora.testnet');
  await page.goto('/jobs/listing/lst-own-page');
  await expect(page.getByRole('heading', {name: 'Manage this listing'})).toHaveCount(0);
  await expect(page.getByTestId('bid-row')).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Send my bid'})).toBeVisible();
});

// ── a job ──────────────────────────────────────────────────────────────────

const plain = (page: Page) => page.getByTestId('state-plain');

test('a visitor sees a settled job in words, with its fee and a link to every transaction', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB(1)}`);
  await expect(plain(page)).toContainText('The worker was paid');
  await expect(page.getByTestId('fact-protocol-fee')).toHaveText('0.04 USDC');
  await expect(page.getByTestId('fact-worker-receives')).toHaveText('3.96 USDC');
  const links = page.getByRole('link', {name: 'View transaction'});
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', /^https:\/\/testnet\.nearblocks\.io\/txns\//);
  // The page's own prompt, not the header link (hidden at phone width).
  const prompt = page.getByText('Are you the client or the worker?');
  await expect(prompt).toBeVisible();
  // It carries the path, so sign-in comes back here (M6).
  await expect(prompt.getByRole('link', {name: 'Sign in'})).toHaveAttribute(
    'href',
    /^\/signin\?next=%2Fjobs%2F/,
  );
  await expect(page.getByRole('button', {name: /Approve|Accept|Cancel/})).toHaveCount(0);
});

test('worker: accept signs one call, as the worker, and the job moves on', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(3))}`);
  await expect(page.getByRole('button', {name: 'Accept the job'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Approve and pay'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Cancel and refund'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Accept the job'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible();
  await expect(plain(page)).toContainText('doing the work');
  expect(await methods(page)).toEqual(['accept_job']);
  expect(await signers(page)).toEqual(['wade.testnet']);
});

test('worker: submitting a result checks it is a JSON object, then signs and shows it', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(4))}`);
  await page.getByRole('button', {name: 'Submit the result'}).click();
  await page.getByLabel('Result (a JSON object)').fill('not json');
  await page.getByRole('button', {name: 'Sign and submit'}).click();
  await expect(page.getByText('That is not valid JSON.')).toBeVisible();
  await page.getByLabel('Result (a JSON object)').fill('[1, 2]');
  await page.getByRole('button', {name: 'Sign and submit'}).click();
  await expect(page.getByText(/has to be a JSON object/)).toBeVisible();
  expect(await txs(page)).toHaveLength(0);

  const prepared = page.waitForRequest((r) => r.url().endsWith('/person-actions/prepare'));
  await page.getByLabel('Result (a JSON object)').fill('{"answer": "two photos"}');
  await page.getByRole('button', {name: 'Sign and submit'}).click();
  const body = (await prepared).postDataJSON();
  expect(body).toMatchObject({action: 'submit', output: {answer: 'two photos'}});
  expect(body.producedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  await expect(page.getByTestId('action-done')).toBeVisible();
  await expect(plain(page)).toContainText('delivered a result');
  await expect(page.getByRole('heading', {name: 'Delivered result'})).toBeVisible();
  expect(await methods(page)).toEqual(['submit_result']);
});

test('client: approve pays, and the fee shows once it is settled', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(5))}`);
  await expect(page.getByRole('button', {name: 'Approve and pay'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Dispute the result'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Accept the job'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(page.getByTestId('action-done')).toContainText('settled');
  await expect(plain(page)).toContainText('The worker was paid');
  await expect(page.getByTestId('fact-protocol-fee')).toHaveText('0.04 USDC');
  expect(await methods(page)).toEqual(['approve']);
});

test('client: a dispute needs a reason, which the API is given before the wallet is asked', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(6))}`);
  await page.getByRole('button', {name: 'Dispute the result'}).click();
  await page.getByLabel('Why is the result not acceptable?').fill('bad');
  await page.getByRole('button', {name: 'Sign and dispute'}).click();
  await expect(page.getByText('The reason is at least 10 characters (now 3).')).toBeVisible();
  expect(await txs(page)).toHaveLength(0);
  await page.getByLabel('Why is the result not acceptable?').fill('The photos do not show the sign.');
  await page.getByRole('button', {name: 'Sign and dispute'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible();
  await expect(plain(page)).toContainText('arbiter decides');
  await expect(page.getByRole('heading', {name: 'The client’s dispute'})).toBeVisible();
  await expect(page.getByText('The photos do not show the sign.')).toBeVisible();
  expect(await methods(page)).toEqual(['dispute']);
});

test('client: an unaccepted job can be cancelled for a refund', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(7))}`);
  await page.getByRole('button', {name: 'Cancel and refund'}).click();
  await expect(plain(page)).toContainText('went back to the client');
  expect(await methods(page)).toEqual(['cancel_job']);
});

test('client: a delivery the chain disagrees with is flagged and cannot be approved', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(8)}`);
  await expect(page.getByTestId('result-mismatch')).toContainText('does not match what the chain recorded');
  await expect(page.getByRole('button', {name: 'Approve and pay'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Dispute the result'})).toBeVisible();
});

test('client: a transaction that is not final yet is waited for, and the wallet is asked once', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(9))}`);
  const confirms: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/person-actions/confirm')) confirms.push(r.url());
  });
  await page.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(page.getByTestId('action-status')).toContainText('Waiting for the chain to confirm');
  await expect(page.getByTestId('action-done')).toBeVisible({timeout: 15_000});
  expect(confirms.length).toBe(2);
  expect(await methods(page)).toEqual(['approve']);
});

test('client: a reverted transaction is reported at once, not polled, and not signed again', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(10))}`);
  await page.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(page.getByTestId('action-error')).toContainText('reverted');
  await expect(page.getByRole('button', {name: 'Check again'})).toHaveCount(0);
  expect(await methods(page)).toEqual(['approve']);
});

test('client: when the job moves on before the confirm is recorded, the action and its error stay on the page', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(19))}`);
  await page.getByRole('button', {name: 'Approve and pay'}).click();
  // The job reloads as settled: "Your move" has nothing left to offer.
  await expect(page.getByRole('button', {name: 'Approve and pay'})).toHaveCount(0, {timeout: 15_000});
  await expect(page.getByTestId('action-error')).toContainText('Pactora could not record it');
  await expect(page.getByRole('button', {name: 'Check again'})).toBeVisible();
});

test('client: a job chosen but not yet on chain is funded from its own page', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${await fresh(page, 'job', JOB(11))}`);
  await expect(plain(page)).toContainText('not on chain yet');
  await expect(page.getByTestId('fact-on-chain-as')).toHaveText('not on chain yet');
  await page.getByRole('button', {name: 'Sign and fund the job'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible();
  await expect(page.getByTestId('fact-on-chain-as')).toHaveText(/^job 9/);
  expect(await methods(page)).toEqual(['create_job']);
});

test('an action whose signer is not the signed-in account is refused before the wallet is asked', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(12)}`);
  await page.getByRole('button', {name: 'Cancel and refund'}).click();
  await expect(page.getByTestId('action-error')).toContainText('has to be signed by someone.testnet');
  expect(await txs(page)).toHaveLength(0);
});

test('a bystander sees the job but no buttons', async ({page}) => {
  await signInAs(page, 'nora.testnet');
  await page.goto(`/jobs/${JOB(15)}`);
  await expect(page.getByTestId('not-a-party')).toContainText('only watch it');
  await expect(page.getByRole('button', {name: /Approve|Dispute|Accept|Submit|Cancel/})).toHaveCount(0);
});

test('a party with nothing to do right now is told so', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${JOB(15)}`);
  await expect(page.getByTestId('no-action')).toContainText('You are the worker');
});

test('a worker’s refusal is shown with its reason', async ({page}) => {
  await page.goto(`/jobs/${JOB(16)}`);
  await expect(plain(page)).toContainText('Too far away for me.');
  await expect(page.getByRole('heading', {name: 'The worker declined'})).toBeVisible();
});

test('the history updates from the stream without a reload', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  const live = await fresh(page, 'job', JOB(13));
  await page.goto(`/jobs/${live}`);
  await expect(page.getByTestId('stream-state')).toHaveText('Live');
  await expect(plain(page)).toContainText('doing the work');
  const reloads: string[] = [];
  page.on('load', () => reloads.push('load'));
  const res = await page.request.post(`${MOCK_API}/__test/job/${live}/advance`);
  expect(res.ok()).toBe(true);
  await expect(plain(page)).toContainText('delivered a result');
  await expect(page.getByText('Result submitted')).toBeVisible();
  expect(reloads).toEqual([]);
});

// ── my account ─────────────────────────────────────────────────────────────

test('/me: earnings are settled jobs only, and say they are not a balance; listings and jobs are listed', async ({
  page,
}) => {
  await signInAs(page, 'mia.testnet');
  await page.goto('/me');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('My account');
  await expect(page.getByTestId('me-account')).toHaveText('mia.testnet');
  await expect(page.getByTestId('me-person')).toHaveText('Mia');
  await expect(page.getByTestId('me-earned')).toHaveText('2.97 USDC');
  await expect(page.getByText(/Settled jobs only: this is not a wallet balance/)).toBeVisible();
  await expect(page.getByTestId('me-settled')).toHaveText('3');
  await expect(page.getByTestId('me-spent')).toHaveText('1 USDC');

  // The listings and the jobs sit in their own tabs (docs/27 §4).
  await page.getByRole('tab', {name: 'Listings'}).click();
  await expect(page.getByRole('list', {name: 'My listings'}).getByRole('article')).toHaveCount(2);
  await page.getByRole('tab', {name: 'Jobs'}).click();
  await expect(page.getByTestId('my-job')).toHaveCount(3);
  await expect(page.getByTestId('my-job').filter({hasText: 'you are the worker'})).toHaveCount(2);
  await page.getByTestId('my-job').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/jobs\/aaaaaaaa-/);
});

test('/me: signed out it asks to sign in; without a person record it points to /join', async ({page}) => {
  await page.goto('/me');
  await expect(page.getByRole('heading', {name: 'Sign in first'})).toBeVisible();
  await signInAs(page, 'sam.testnet');
  await page.goto('/me');
  await expect(page.getByTestId('me-person')).toHaveText('None yet');
  await expect(page.getByRole('link', {name: 'Join as a person'}).last()).toBeVisible();
  await expect(page.getByRole('heading', {name: 'My jobs'})).toHaveCount(0);
});

// ── accessibility, with data ───────────────────────────────────────────────

async function scan(page: Page, path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await ready();
  await expectNoBlockingViolations(page, path);
}

test('accessibility: the owner pages, signed in', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await scan(page, '/jobs/new', () => expect(page.getByLabel('Title', {exact: true})).toBeVisible());
  await scan(page, '/jobs/listing/lst-own-page', () =>
    expect(page.getByTestId('bid-row').first()).toBeVisible(),
  );
  await scan(page, `/jobs/${JOB(14)}`, () =>
    expect(page.getByRole('button', {name: 'Cancel and refund'})).toBeVisible(),
  );
  // The forms that open on demand.
  await page.goto('/jobs/listing/lst-own-page');
  await page.getByRole('button', {name: 'Select Bidder 25'}).click();
  await expect(page.getByLabel(/^Why/)).toBeVisible();
  await expectNoBlockingViolations(page, 'the decision form');
  await page.goto(`/jobs/${JOB(17)}`);
  await page.getByRole('button', {name: 'Dispute the result'}).click();
  await expectNoBlockingViolations(page, 'the dispute form');
});

test('accessibility: /me, signed in', async ({page}) => {
  await signInAs(page, 'mia.testnet');
  await scan(page, '/me#jobs', () => expect(page.getByTestId('my-job').first()).toBeVisible());
});

test('accessibility: the bid form, signed in', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await scan(page, '/jobs/listing/lst-view', () =>
    expect(page.getByRole('button', {name: 'Send my bid'})).toBeVisible(),
  );
  await page.getByRole('button', {name: 'Send my bid'}).click();
  await expectNoBlockingViolations(page, 'the bid form with errors');
});
