import {readFileSync} from 'node:fs';
import {expect, test, type Browser, type Page, type TestInfo} from '@playwright/test';
import {
  expectHeaderFits,
  shot,
  apiFetch,
  apiPerson,
  apiRaw,
  apiSession,
  chainView,
  depositInto,
  eventually,
  facts,
  ftBalance,
  newAccount,
  pageToken,
  personAction,
  pngWithMark,
  signIn,
  svc,
  userContext,
  type User,
} from './live';

/**
 * Every kind of user, end to end, in a real browser against the REAL stack:
 * the API, signer, indexer and notifier of pactora-backend-near on the local
 * near-sandbox (scripts/live-ui-stack.mjs). Sign-ins are NEP-413 signatures
 * the API verifies; every on-chain step is a transaction signed with the
 * account's own key that lands on the sandbox; and after each step the test
 * reads what the API and the chain then hold, not only what the page says.
 *
 * Each browser project uses accounts of its own, so projects can run side by
 * side. The DAO council part changes the contract's arbiter for a while, so
 * it runs in the chromium project only.
 */

test.describe.configure({mode: 'serial'});
test.setTimeout(240_000);

const DAY = 86_400_000;
const PRICE = '50000'; // 0.05 mUSDC: under the default per-task cap (0.1)
const SANCTIONED = 'Ivan Petrovich Sanctionov';
const GPS_MARK = 'GPS-52.5200N-13.4050E';

interface Person extends User {
  name: string;
  chainAgentId: string;
}

const s: {
  tag: string;
  worker?: Person;
  client?: Person;
  listingId?: string;
  listing2Id?: string;
  jobId?: string;
  chainJobId?: string;
  fileId?: string;
  operatorAgentId?: string;
  operatorName?: string;
} = {tag: ''};

const pad = (n: number) => String(n).padStart(2, '0');
/** A `datetime-local` value `ms` from now, in the browser's (= this machine's) time zone. */
function localInput(ms: number) {
  const d = new Date(Date.now() + ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sign in and join as a person: register_agent + accept_wallet from the wallet, then POST /v1/people. */
async function join(user: User, name: string): Promise<Person> {
  await signIn(user);
  const {page} = user;
  await page.goto('/join');
  await page.locator('#join-name').fill(name);
  // Join stays disabled until the terms are accepted (the /join terms box).
  await page.getByLabel(/I accept the Terms and Privacy policy/).check();
  await page.getByRole('button', {name: 'Join', exact: true}).click();
  await expect(page.getByRole('heading', {name: `Welcome, ${name}`})).toBeVisible({timeout: 60_000});
  const session = (await apiFetch('/v1/session', {token: await pageToken(page)})) as {
    person: {chainAgentId: string; name: string} | null;
  };
  expect(session.person?.name).toBe(name);
  const chainAgentId = session.person!.chainAgentId;
  // On chain: owner = wallet = the account itself, accepted.
  const agent = await chainView<{owner: string; wallet: string | null; frozen: boolean}>('get_agent', {
    agent_id: Number(chainAgentId),
  });
  expect(agent).toMatchObject({owner: user.account, wallet: user.account, frozen: false});
  return {...user, name, chainAgentId};
}

async function manageAmount(page: Page, chainAgentId: string, kind: 'fund' | 'stake', amount: string) {
  await page.goto(`/agents/${chainAgentId}/manage`);
  await page.locator(`#${kind}-amount`).fill(amount);
  await page.getByRole('button', {name: kind === 'fund' ? 'Fund' : 'Stake', exact: true}).click();
  await expect(
    page.getByRole('status').filter({hasText: `${kind === 'fund' ? 'Fund' : 'Stake'} sent.`}),
  ).toBeVisible({
    timeout: 60_000,
  });
}

async function fillListing(page: Page, title: string) {
  await page.goto('/jobs/new');
  await page.locator('#nl-title').fill(title);
  await page.locator('#nl-description').fill('Photograph the front of the corner bakery in daylight.');
  await page.locator('#nl-category').selectOption('physical');
  await page.locator('#nl-interactionMode').selectOption('capture');
  await page.locator('#nl-skills').fill('shop-photos');
  await page.locator('#nl-location').fill('Berlin');
  await page.locator('#nl-criteria').fill('The whole shop front and its sign are in the photo, in focus.');
  await page.locator('#nl-price').fill('0.05');
  await page.locator('#nl-maxWorkers').fill('1');
  await page.locator('#nl-estimatedMinutes').fill('30');
  await page.locator('#nl-deadline').fill(localInput(DAY));
  await page.getByRole('button', {name: 'Post the listing'}).click();
}

async function bid(page: Page, listingId: string) {
  await page.goto(`/jobs/listing/${listingId}`);
  await page.locator('#bid-price').fill('0.05');
  await page.locator('#bid-proposal').fill('I live next door and can photograph it within the hour.');
  await page.getByRole('button', {name: 'Send my bid'}).click();
}

/**
 * Since 3f13e04 the page reads the standing first and offers no bid (the
 * form is disabled, with the reason); the API still refuses one, in words.
 */
async function bidRefused(page: Page, listingId: string, pageWords: string, apiWords: RegExp) {
  await page.goto(`/jobs/listing/${listingId}`);
  await expect(page.getByTestId('bid-not-ready')).toContainText(pageWords, {timeout: 30_000});
  await expect(page.getByRole('button', {name: 'Send my bid'})).toBeDisabled();
  const res = await apiRaw(`/v1/listings/${listingId}/applications`, {
    method: 'POST',
    token: await pageToken(page),
    body: {
      action: 'apply',
      priceBaseUnits: PRICE,
      proposal: 'I live next door and can photograph it within the hour.',
    },
  });
  expect(res.status).toBe(403);
  expect(await res.text()).toMatch(apiWords);
}

test.beforeAll(({}, info) => {
  // Project and attempt: a rerun against the same stack makes new accounts.
  s.tag = `${info.project.name.slice(0, 4)}${Date.now().toString(36).slice(-3)}`;
});

test('agent operator: /register signs the account, register_agent and a first Fund, for real', async ({
  browser,
}, info) => {
  const operator = await userContext(
    browser,
    info,
    await newAccount(`${s.tag}-operator`, {near: '5', musdc: 5_000_000n}),
  );
  const {page} = operator;
  s.operatorName = `Live Bot ${s.tag} ${facts.run.slice(-4)}`;
  await page.goto('/register');
  await page.getByRole('button', {name: /Connect wallet/}).click();
  await page.locator('#reg-name').fill(s.operatorName);
  await page.locator('#reg-capabilities').fill('shop-photos');
  await page.getByLabel('First funding (optional)').fill('1.5');
  await page
    .getByRole('button', {name: /Register/})
    .last()
    .click();
  const key = page.getByText(/ax_[A-Za-z0-9_-]{20,}/).first();
  await expect(key).toBeVisible({timeout: 90_000});
  const profile = page.getByRole('link', {name: /View its profile/});
  const href = (await profile.getAttribute('href'))!;
  const agentId = href.split('/').pop()!;
  s.operatorAgentId = agentId;

  // The API holds it, with the sub-account as its wallet.
  const agent = (await apiFetch(`/v1/agents/${agentId}`)) as {
    name: string;
    walletAddress: string;
    chainAgentId: string;
  };
  expect(agent.name).toBe(s.operatorName);
  expect(agent.walletAddress.endsWith(`.${operator.account}`)).toBe(true);
  // The chain holds it: the wallet accepted, and the Fund in the purse.
  const onChain = await eventually(
    () => chainView<{wallet: string | null}>('get_agent', {agent_id: Number(agent.chainAgentId)}),
    (a) => a?.wallet === agent.walletAddress,
    'agent wallet accepted on chain',
  );
  expect(onChain.wallet).toBe(agent.walletAddress);
  const purse = await chainView<{balance: string}>('purse_of', {agent_id: Number(agent.chainAgentId)});
  expect(purse.balance).toBe('1500000');
  // The page asked for exactly three transactions: account, register_agent, Fund.
  const sent = (await page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs)) as {
    actions: {type: string; params?: {methodName?: string}}[];
  }[];
  expect(
    sent.map((t) => t.actions.find((a) => a.params?.methodName)?.params?.methodName ?? t.actions[0]!.type),
  ).toEqual(['CreateAccount', 'register_agent', 'ft_transfer_call']);
  await operator.context.close();
});

test('agent operator: a first Fund the chain refuses is reported, not passed over', async ({
  browser,
}, info) => {
  // Found here on 2026-11-08: the page ignored a failed first Fund and said
  // nothing. Fixed in app/register/page.tsx (the Fund's outcome is checked).
  // No mUSDC at all: ft_transfer_call fails on the token.
  const operator = await userContext(browser, info, await newAccount(`${s.tag}-broke`, {near: '5'}));
  const {page} = operator;
  await page.goto('/register');
  await page.getByRole('button', {name: /Connect wallet/}).click();
  await page.locator('#reg-name').fill(`Broke Bot ${s.tag}`);
  await page.locator('#reg-capabilities').fill('shop-photos');
  await page.getByLabel('First funding (optional)').fill('1.5');
  await page
    .getByRole('button', {name: /Register/})
    .last()
    .click();
  // Either an error, or a registration that says the funding did not happen.
  const outcome = page
    .getByText(/ax_[A-Za-z0-9_-]{20,}/)
    .first()
    .or(page.getByText('Registration did not complete'));
  await expect(outcome).toBeVisible({timeout: 90_000});
  // What the chain holds: the agent exists and its purse is empty (observed 2026-11-08 in all five projects).
  const href = await page.getByRole('link', {name: /View its profile/}).getAttribute('href');
  const agent = (await apiFetch(`/v1/agents/${href!.split('/').pop()}`)) as {chainAgentId: string};
  const purse = await chainView<{balance: string}>('purse_of', {agent_id: Number(agent.chainAgentId)});
  expect(purse.balance).toBe('0');
  // What the page then says.
  await expect(page.getByText(/fund(ing)? (failed|did not)/i).first()).toBeVisible({timeout: 5_000});
  await operator.context.close();
});

test('worker person: signs in, joins on chain, stakes, edits a public profile', async ({browser}, info) => {
  const account = await newAccount(`${s.tag}-worker`, {near: '5', musdc: 20_000_000n});
  const user = await userContext(browser, info, account);
  const worker = await join(user, `Wanda ${s.tag} ${facts.run.slice(-4)}`);
  s.worker = worker;
  const {page} = worker;

  await manageAmount(page, worker.chainAgentId, 'stake', '10.5');
  const stake = await chainView<{available: string; hireable?: boolean}>('stake_of', {
    agent_id: Number(worker.chainAgentId),
  });
  expect(BigInt(stake.available)).toBeGreaterThanOrEqual(BigInt(facts.minStake));
  await expect(page.getByText('Hireable', {exact: true})).toBeVisible({timeout: 30_000});

  await page.goto('/me');
  await expect(page.getByTestId('me-person')).toHaveText(worker.name);
  // /me is tabbed; a tab opens from the URL hash.
  await page.goto('/me#profile');
  await page.locator('#pf-name').fill(worker.name);
  await page.locator('#pf-headline').fill('Photos of shop fronts, same day');
  await page.getByLabel('Publish: list me in the directory').check();
  await page.getByRole('button', {name: 'Save profile'}).click();
  await expect(page.getByTestId('profile-saved')).toBeVisible();
  const mine = (await apiFetch('/v1/me/profile', {token: await pageToken(page)})) as {
    displayName: string;
    headline: string;
    published: boolean;
  };
  expect(mine).toMatchObject({
    displayName: worker.name,
    headline: 'Photos of shop fronts, same day',
    published: true,
  });
});

test('client person: joins, claims test tokens, funds the purse, posts a listing', async ({
  browser,
}, info) => {
  const account = await newAccount(`${s.tag}-client`, {near: '5', musdc: 20_000_000n});
  const user = await userContext(browser, info, account);
  const client = await join(user, `Carl ${s.tag} ${facts.run.slice(-4)}`);
  s.client = client;
  const {page} = client;

  // The faucet sends real tokens from its own float.
  const before = await ftBalance(account);
  await page.goto('/me');
  await page.getByRole('button', {name: 'Claim test tokens'}).click();
  await expect(page.getByTestId('faucet-sent')).toBeVisible({timeout: 60_000});
  expect((await ftBalance(account)) - before).toBe(5_000_000n);

  await manageAmount(page, client.chainAgentId, 'fund', '1');
  const purse = await chainView<{balance: string}>('purse_of', {agent_id: Number(client.chainAgentId)});
  expect(purse.balance).toBe('1000000');

  const title = `Bakery front ${s.tag} ${facts.run.slice(-4)}`;
  await fillListing(page, title);
  await page.waitForURL(/\/jobs\/listing\//, {timeout: 30_000});
  s.listingId = decodeURIComponent(page.url().split('/').pop()!);
  await expect(page.getByRole('heading', {name: title})).toBeVisible();
  const listing = (await apiFetch(`/v1/listings/${s.listingId}`)) as {
    title: string;
    status: string;
    maxPriceBaseUnits: string;
    client: {name: string};
  };
  expect(listing).toMatchObject({title, status: 'open', maxPriceBaseUnits: PRICE});
  expect(listing.client.name).toBe(client.name);

  // A second listing stays open, for the held and blocked accounts to try.
  await fillListing(page, `Second front ${s.tag} ${facts.run.slice(-4)}`);
  await page.waitForURL(/\/jobs\/listing\//, {timeout: 30_000});
  s.listing2Id = decodeURIComponent(page.url().split('/').pop()!);
});

test('worker bids; client reviews the bids, selects, and funds the job from the wallet', async () => {
  const {worker, client} = s;
  await bid(worker!.page, s.listingId!);
  await expect(worker!.page.getByTestId('my-bid')).toContainText('pending', {timeout: 30_000});

  const page = client!.page;
  await page.goto(`/jobs/listing/${s.listingId}`);
  const firstBid = page
    .getByTestId(/^bid-(row|card)$/)
    .filter({visible: true})
    .first();
  await firstBid.waitFor();
  await firstBid.scrollIntoViewIfNeeded();
  await shot(page, 'listing-bids');
  // A table from md up, cards on a phone: whichever this viewport shows.
  const row = page
    .getByTestId(/^bid-(row|card)$/)
    .filter({hasText: worker!.name})
    .filter({visible: true});
  await expect(row).toContainText('0.05');
  await row.getByRole('button', {name: `Select ${worker!.name}`}).click();
  await page.locator('#decide-reason').fill('Lives next door and has a clear plan.');
  await page.getByRole('button', {name: 'Confirm selection'}).click();
  await page.getByRole('button', {name: 'Sign and fund the job'}).click();
  await expect(page.getByTestId('funded-by-wallet')).toBeVisible({timeout: 90_000});
  const link = page.getByTestId('funded-by-wallet').getByRole('link', {name: 'Open the job'});
  s.jobId = (await link.getAttribute('href'))!.split('/').pop()!;

  const job = (await apiFetch(`/v1/jobs/${s.jobId}`)) as {chainJobId: string; amount: string; state: string};
  expect(job.amount).toBe(PRICE);
  s.chainJobId = job.chainJobId;
  const onChain = await chainView<{amount: string; state: string; client: number; worker: number}>(
    'get_job',
    {
      job_id: Number(job.chainJobId),
    },
  );
  expect(onChain).toMatchObject({amount: PRICE, state: 'Created'});
  expect(String(onChain.client)).toBe(client!.chainAgentId);
  expect(String(onChain.worker)).toBe(worker!.chainAgentId);
  const listing = (await apiFetch(`/v1/listings/${s.listingId}`)) as {status: string};
  expect(listing.status).toBe('filled');
});

test('worker accepts, uploads an evidence photo, chats and posts a draft', async () => {
  const page = s.worker!.page;
  await page.goto(`/jobs/${s.jobId}`);
  await expect(page.getByText('You are the worker').first()).toBeVisible({timeout: 30_000});
  await page.getByRole('button', {name: 'Accept the job'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(s.chainJobId)}),
    (j) => j.state === 'Accepted',
    'job accepted on chain',
  );

  await page.reload();
  await page.locator('#photo-input').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: pngWithMark(GPS_MARK),
  });
  await expect(page.getByRole('list', {name: 'Photos'}).getByRole('listitem')).toHaveCount(1, {
    timeout: 30_000,
  });
  const token = await pageToken(page);
  const files = (await apiFetch(`/v1/jobs/${s.jobId}/files`, {token})) as {
    files: {fileId: string; sha256: string; metadataRemoved?: string[]}[];
  };
  expect(files.files).toHaveLength(1);
  s.fileId = files.files[0]!.fileId;
  const bytes = Buffer.from(await (await apiRaw(`/v1/files/${s.fileId}`, {token})).arrayBuffer());
  expect(bytes.includes(Buffer.from(GPS_MARK))).toBe(false);

  await page.locator('#chat-body').fill('Photo is up. The sign is readable from across the street.');
  await page.getByRole('button', {name: 'Send', exact: true}).click();
  await expect(page.getByRole('list', {name: 'Messages'})).toContainText('The sign is readable');

  await page.locator('#draft-text').fill('Round 1: the whole bakery front in daylight, sign in focus.');
  await page.getByRole('button', {name: 'Post draft 1'}).click();
  await expect(page.getByTestId('draft-1')).toBeVisible({timeout: 30_000});
});

test('client accepts the draft; worker submits it on chain; client approves and the worker is paid', async () => {
  const cpage = s.client!.page;
  const workerPurseBefore = await chainView<{balance: string}>('purse_of', {
    agent_id: Number(s.worker!.chainAgentId),
  });
  await cpage.goto(`/jobs/${s.jobId}`);
  await expect(cpage.getByText('You are the client').first()).toBeVisible({timeout: 30_000});
  await expect(cpage.getByRole('list', {name: 'Messages'})).toContainText('The sign is readable');
  const review = cpage.getByRole('form', {name: 'Review of draft 1'});
  for (const box of await review.getByRole('checkbox').all()) await box.check();
  await cpage.locator('#review-reason').fill('The front and the sign are both clear. Thanks.');
  await review.getByRole('button', {name: 'Accept this draft'}).click();
  await expect(cpage.getByTestId('accepted-hash')).toBeVisible({timeout: 30_000});
  const acceptedHash = (await cpage.getByTestId('accepted-hash').textContent())!.trim();

  const wpage = s.worker!.page;
  await wpage.goto(`/jobs/${s.jobId}`);
  await wpage.getByRole('button', {name: 'Sign and submit the accepted draft'}).click();
  await expect(wpage.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  const submitted = await eventually(
    () => chainView<{state: string; result_hash: string | null}>('get_job', {job_id: Number(s.chainJobId)}),
    (j) => j.state === 'Submitted',
    'job submitted on chain',
  );
  expect(submitted.result_hash).toBeTruthy();
  // What the client accepted is what went on chain.
  expect(submitted.result_hash).toContain(acceptedHash.replace(/…$/, ''));

  await cpage.reload();
  await cpage.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(cpage.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  const settled = await eventually(
    () => chainView<{state: string; fee: string}>('get_job', {job_id: Number(s.chainJobId)}),
    (j) => j.state === 'Settled',
    'job settled on chain',
  );
  const after = await chainView<{balance: string}>('purse_of', {agent_id: Number(s.worker!.chainAgentId)});
  const paid = BigInt(after.balance) - BigInt(workerPurseBefore.balance);
  expect(paid).toBe(BigInt(PRICE) - BigInt(settled.fee));
  // The indexer saw it: the API's job and the worker's earnings.
  await eventually(
    async () => ((await apiFetch(`/v1/jobs/${s.jobId}`)) as {state: string}).state,
    (st) => st === 'settled',
    'API job settled (indexer)',
  );
  const me = (await apiFetch('/v1/me', {token: await pageToken(wpage)})) as {
    earnings: {settledCount: number; receivedBaseUnits: string};
  };
  expect(me.earnings.settledCount).toBe(1);
  expect(me.earnings.receivedBaseUnits).toBe(String(paid));
  await wpage.goto(`/jobs/${s.jobId}`);
  await expect(wpage.getByRole('banner')).toBeVisible();
  await expectHeaderFits(wpage);
  await shot(wpage, 'job-settled');
  await wpage.goto('/me');
  await expect(wpage.getByTestId('me-settled')).toHaveText('1');
  await shot(wpage, 'me-earnings');
});

test('the worker sees notifications; both parties leave a review, revealed once both have', async () => {
  const wpage = s.worker!.page;
  await wpage.goto('/notifications');
  await expect(wpage.getByRole('list', {name: 'Notifications'}).getByRole('listitem').first()).toBeVisible({
    timeout: 30_000,
  });
  const feed = (await apiFetch('/v1/notifications', {token: await pageToken(wpage)})) as {
    items?: unknown[];
    notifications?: unknown[];
    unread: number;
  };
  expect((feed.items ?? feed.notifications ?? []).length).toBeGreaterThan(0);

  const cpage = s.client!.page;
  for (const [page, rating, body] of [
    [cpage, '5', 'Fast, clear photo, exactly what was asked.'],
    [wpage, '4', 'Clear brief and a quick review.'],
  ] as const) {
    await page.goto(`/jobs/${s.jobId}`);
    await page.locator('#pr-rating').selectOption(rating);
    await page.locator('#pr-body').fill(body);
    await page.getByRole('button', {name: 'Send review'}).click();
    await expect(page.getByTestId('my-review')).toContainText(body, {timeout: 30_000});
  }
  await cpage.reload();
  await expect(cpage.getByTestId('their-review')).toContainText('Clear brief and a quick review.');
  const profile = (await apiFetch('/v1/me/profile', {token: await pageToken(wpage)})) as {profileId: string};
  const shown = (await apiFetch(`/v1/profiles/${profile.profileId}`)) as {
    rating: {average: number; count: number};
  };
  expect(shown.rating).toMatchObject({average: 5, count: 1});
});

test('a non-party cannot open the job evidence or chat', async ({browser}, info) => {
  const stranger = await userContext(browser, info, await newAccount(`${s.tag}-stranger`, {near: '3'}));
  await join(stranger, `Stan ${s.tag} ${facts.run.slice(-4)}`);
  const {page} = stranger;
  await page.goto(`/jobs/${s.jobId}`);
  await expect(page.getByTestId('not-a-party')).toBeVisible({timeout: 30_000});
  await expect(page.getByRole('heading', {name: 'Evidence photos'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Conversation'})).toHaveCount(0);
  const token = await pageToken(page);
  for (const path of [
    `/v1/jobs/${s.jobId}/files`,
    `/v1/jobs/${s.jobId}/messages`,
    `/v1/files/${s.fileId}`,
    `/v1/jobs/${s.jobId}/drafts`,
  ]) {
    const res = await apiRaw(path, {token});
    expect([403, 404], `${path} -> ${res.status}`).toContain(res.status);
  }
  // Signed out, the bytes are not served either.
  expect((await apiRaw(`/v1/files/${s.fileId}`)).status).toBe(401);
  // And the admin console says no.
  await page.goto('/admin');
  await expect(page.getByText('No admin access')).toBeVisible({timeout: 30_000});
  await stranger.context.close();
});

test('a held account (a real sanctions hit) is refused posting and bidding, with the reason; two reviewers clear it', async ({
  browser,
}, info) => {
  const held = await join(
    await userContext(browser, info, await newAccount(`${s.tag}-held`, {near: '3'})),
    `Holly ${s.tag} ${facts.run.slice(-4)}`,
  );
  const {page} = held;
  await page.goto('/me#settings');
  await page.locator('#kyc-name').fill(SANCTIONED);
  await page.getByRole('button', {name: 'Start the identity check'}).click();
  await expect(page.getByTestId('standing')).toContainText('On hold', {timeout: 30_000});
  const kyc = (await apiFetch('/v1/kyc', {token: await pageToken(page)})) as {standing: string};
  expect(kyc.standing).toBe('hold');

  await fillListing(page, `Held try ${s.tag}`);
  await expect(
    page.getByText(/on hold while a compliance review is open, and cannot post work/),
  ).toBeVisible();
  await bidRefused(
    page,
    s.listing2Id!,
    'on hold',
    /on hold while a compliance review is open, and cannot apply for work/,
  );

  // The compliance reviewers, on /admin. A strong match needs both.
  for (const [i, reviewer] of facts.reviewers.entries()) {
    const r = await userContext(browser, info, reviewer);
    await signIn(r);
    await r.page.goto('/admin');
    await expect(r.page.getByTestId('admin-roles')).toContainText('Compliance reviewer', {timeout: 30_000});
    const item = r.page
      .getByRole('list', {name: 'Compliance cases'})
      .getByRole('listitem')
      .filter({hasText: held.account});
    await expect(item).toContainText(SANCTIONED);
    await expect(item).toContainText(`${i} decision(s)`);
    await item
      .getByLabel('Reason (10-2000 characters)')
      .fill(`Reviewer ${i + 1}: a different person, date of birth differs.`);
    await item.getByRole('button', {name: 'Clear', exact: true}).click();
    if (i === 0) await expect(item).toContainText('1 decision(s)', {timeout: 30_000});
    else await expect(item).toHaveCount(0, {timeout: 30_000});
    await r.context.close();
  }
  const after = (await apiFetch('/v1/kyc', {token: await pageToken(page)})) as {standing: string};
  expect(after.standing).toBe('clear');
  await page.goto('/me#settings');
  await expect(page.getByTestId('standing')).toContainText('Clear');
  await held.context.close();
});

test('a blocked account is refused posting and bidding, with the reason', async ({browser}, info) => {
  const blocked = await join(
    await userContext(browser, info, await newAccount(`${s.tag}-blocked`, {near: '3'})),
    `Bob ${s.tag} ${facts.run.slice(-4)}`,
  );
  await svc('/standing', {
    accountId: blocked.account,
    standing: 'blocked',
    reason: 'live UI test: confirmed match',
  });
  const {page} = blocked;
  await fillListing(page, `Blocked try ${s.tag}`);
  await expect(page.getByText(/blocked after a compliance review and cannot post work/)).toBeVisible();
  await bidRefused(
    page,
    s.listing2Id!,
    'blocked',
    /blocked after a compliance review and cannot apply for work/,
  );
  await page.goto('/me#settings');
  await expect(page.getByTestId('standing')).toContainText('Blocked');
  await blocked.context.close();
});

test('council members rule a dispute through the arbiter DAO from /admin', async ({browser}, info) => {
  test.skip(info.project.name !== 'chromium', 'the DAO changes the arbiter for everyone: chromium only');
  // A disputed job: a listing job driven to Submitted through the API (every
  // transaction signed for real), then disputed by the client in the page.
  const client = s.client!;
  const worker = s.worker!;
  const ct = await apiSession(client.account);
  const wt = await apiSession(worker.account);
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: ct,
    headers: {'idempotency-key': `dispute-${facts.run}`},
    body: {
      title: 'Photograph the bakery again',
      description: 'A second photo of the bakery front, from the other side of the street.',
      category: 'physical',
      interactionMode: 'capture',
      skills: ['shop-photos'],
      location: 'Berlin',
      maxPriceBaseUnits: PRICE,
      maxWorkers: 1,
      estimatedMinutes: 30,
      deadline: new Date(Date.now() + DAY).toISOString(),
      criteria: 'The whole shop front and its sign are in the photo, in focus.',
    },
  })) as {listingId: string};
  const application = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {
    method: 'POST',
    token: wt,
    body: {action: 'apply', priceBaseUnits: PRICE, proposal: 'Same street, same light, within the hour.'},
  })) as {applicationId: string};
  const decided = (await apiFetch(`/v1/listings/${listing.listingId}/decide`, {
    method: 'POST',
    token: ct,
    body: {applicationId: application.applicationId, action: 'select', reason: 'Did the first one well.'},
  })) as {job: {jobId: string}};
  const jobId = decided.job.jobId;
  await personAction(ct, client.account, jobId, 'create');
  await personAction(wt, worker.account, jobId, 'accept');
  const draft = (await apiFetch(`/v1/jobs/${jobId}/drafts`, {
    method: 'POST',
    token: wt,
    body: {text: 'Round 1: the photo from across the street.'},
  })) as {draftId: string; snapshotHash: string};
  await apiFetch(`/v1/jobs/${jobId}/drafts/${draft.draftId}/review`, {
    method: 'POST',
    token: ct,
    body: {
      snapshotHash: draft.snapshotHash,
      decision: 'accept_draft',
      reason: 'Looks right at first sight.',
      checks: [
        {
          criterion: 'The whole shop front and its sign are in the photo, in focus.',
          met: true,
          support: 'draft 1',
        },
      ],
    },
  });
  await personAction(wt, worker.account, jobId, 'submit');
  const chainJobId = ((await apiFetch(`/v1/jobs/${jobId}`)) as {chainJobId: string}).chainJobId;

  // The client disputes in the page.
  const cpage = client.page;
  await cpage.goto(`/jobs/${jobId}`);
  await cpage.getByRole('button', {name: 'Dispute the result'}).click();
  await cpage
    .locator('#job-reason')
    .fill('The photo shows the wrong shop: the sign is the pharmacy next door.');
  await cpage.getByRole('button', {name: 'Sign and dispute'}).click();
  await expect(cpage.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(chainJobId)}),
    (j) => j.state === 'Disputed',
    'job disputed on chain',
  );

  // A 2-of-3 Sputnik council becomes the arbiter.
  const members = [
    await newAccount(`${s.tag}-council1`, {near: '3'}),
    await newAccount(`${s.tag}-council2`, {near: '3'}),
    await newAccount(`${s.tag}-council3`, {near: '3'}),
  ];
  await svc('/dao', {members});
  try {
    const m1 = await userContext(browser, info, members[0]!);
    await signIn(m1);
    // The API caches the arbiter's council for 30 s (admin.ts councilCacheMs),
    // and the arbiter just changed: reload until the cache has turned over.
    await expect(async () => {
      await m1.page.goto('/admin');
      await expect(m1.page.getByTestId('admin-roles')).toContainText('Arbiter council', {timeout: 5_000});
    }).toPass({timeout: 60_000, intervals: [2_000, 5_000]});
    await m1.page.getByRole('button', {name: `Job ${chainJobId}`}).click();
    await expect(m1.page.getByTestId('dispute-reason')).toContainText('pharmacy next door');
    await shot(m1.page, 'admin-dispute-desk');
    await m1.page.getByRole('button', {name: 'Propose: refund the client'}).click();
    await expect(m1.page.getByTestId('desk-notice')).toContainText('Proposed to the DAO', {timeout: 90_000});
    const proposals = await eventually(
      async () =>
        (await apiFetch(`/v1/admin/disputes/${jobId}/proposals`, {token: await pageToken(m1.page)})) as {
          proposals: {id: number; status: string; forWorker: boolean}[];
        },
      (p) => p.proposals.some((x) => x.status === 'InProgress'),
      'proposal on the DAO',
    );
    const pid = proposals.proposals.find((p) => p.status === 'InProgress')!.id;

    for (const [i, member] of members.slice(0, 2).entries()) {
      const m = i === 0 ? m1 : await userContext(browser, info, member);
      if (i > 0) await signIn(m);
      await m.page.goto('/admin');
      await m.page.getByRole('button', {name: `Job ${chainJobId}`}).click();
      const row = m.page.getByTestId(`proposal-${pid}`);
      await row.getByRole('button', {name: 'Approve'}).click();
      if (i === 0) {
        await expect(row).toContainText('You voted', {timeout: 90_000});
        const one = await chainView<{state: string}>('get_job', {job_id: Number(chainJobId)});
        expect(one.state).toBe('Disputed');
      }
      await (i === 0
        ? Promise.resolve()
        : expect(m.page.getByTestId('desk-notice')).toBeVisible({timeout: 90_000}));
    }
    const ruled = await eventually(
      () => chainView<{state: string; outcome: string | null}>('get_job', {job_id: Number(chainJobId)}),
      (j) => j.state === 'Refunded',
      'job ruled by the DAO',
    );
    expect(ruled.outcome).toBe('DisputeLost');
  } finally {
    await svc('/dao/restore');
  }
  expect((await chainView<{arbiter: string}>('get_roles')).arbiter).toBe(facts.arbiter);
});

test('visitor (signed out): home, agents, jobs board, people, docs and status show the real data', async ({
  browser,
}, info) => {
  const v = await userContext(browser, info, null);
  const {page} = v;
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await shot(page, 'home');

  await page.goto('/agents');
  await expect(page.getByText(s.operatorName!).first()).toBeVisible({timeout: 30_000});

  await page.goto('/jobs');
  await expect(page.getByText(`Second front ${s.tag} ${facts.run.slice(-4)}`).first()).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, 'jobs-board');
  await page.goto(`/jobs/listing/${s.listing2Id}`);
  await expect(page.getByRole('link', {name: 'Sign in'}).first()).toBeVisible();

  await page.goto('/people');
  await expect(page.getByText(s.worker!.name).first()).toBeVisible({timeout: 30_000});
  await shot(page, 'people');

  await page.goto('/docs');
  await expect(page.getByRole('heading').first()).toBeVisible();

  await page.goto('/status');
  const status = (await apiFetch('/v1/status')) as {chains: {headBlock: number}[]};
  await expect(page.getByText(/operational/i).first()).toBeVisible({timeout: 30_000});
  expect(status.chains[0]!.headBlock).toBeGreaterThan(0);
  // I1 after everything above: the contract holds exactly what it owes.
  // (Read twice, so a transaction of another project landing in between is not a false alarm.)
  await eventually(
    async () => [(await chainView<{sum: string}>('get_totals')).sum, String(await ftBalance(facts.pactora))],
    ([owed, held]) => owed === held,
    'I1: owed == held',
    20_000,
  );
  await v.context.close();
});

// ── 2026-11-10: the flows of 3f13e04 / 2ffa24b, live ──────────────────────
// Each test below makes its own accounts, so it runs alone (--grep) as well
// as in order. People are made through the chain and the API (apiPerson:
// register_agent, accept_wallet, POST /v1/people, all real); what the test is
// about happens in the page.

const STAKE = () => BigInt(facts.minStake) + 1_000_000n;
const CRITERIA = 'The whole shop front and its sign are in the photo, in focus.';

/** The page's `utc()` (components/market/ListingCard.tsx), to compare what the page prints. */
function utcText(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString('en', {month: 'short', timeZone: 'UTC'})} ${d.getUTCFullYear()}, ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

function listingBody(title: string) {
  return {
    title,
    description: 'Photograph the front of the corner bakery in daylight.',
    category: 'physical',
    interactionMode: 'capture',
    skills: ['shop-photos'],
    location: 'Berlin',
    maxPriceBaseUnits: PRICE,
    maxWorkers: 1,
    estimatedMinutes: 30,
    deadline: new Date(Date.now() + DAY).toISOString(),
    criteria: CRITERIA,
  };
}

/** A signed-in page for an account the wallet service holds. */
async function signedIn(browser: Browser, info: TestInfo, account: string): Promise<User> {
  const u = await userContext(browser, info, account);
  await signIn(u);
  return u;
}

interface PageAgent {
  owner: User;
  name: string;
  agentId: string;
  chainAgentId: string;
  apiKey: string;
}

/** An agent registered on /register by its owner (sub-account, register_agent, optional Fund); its key read off the page. */
async function registerInPage(
  browser: Browser,
  info: TestInfo,
  label: string,
  {fund, musdc = 20_000_000n}: {fund?: string; musdc?: bigint} = {},
): Promise<PageAgent> {
  const owner = await userContext(browser, info, await newAccount(`${s.tag}-${label}`, {near: '6', musdc}));
  const {page} = owner;
  const name = `${label} bot ${s.tag} ${facts.run.slice(-4)}`;
  await page.goto('/register');
  await page.getByRole('button', {name: /Connect wallet/}).click();
  await page.locator('#reg-name').fill(name);
  await page.locator('#reg-capabilities').fill('shop-photos');
  await page.locator('#reg-price').fill(PRICE);
  if (fund) await page.getByLabel('First funding (optional)').fill(fund);
  await page
    .getByRole('button', {name: /Register/})
    .last()
    .click();
  const keyText = page.getByText(/ax_[A-Za-z0-9_-]{20,}/).first();
  await expect(keyText).toBeVisible({timeout: 90_000});
  const apiKey = /ax_[A-Za-z0-9_-]{20,}/.exec((await keyText.textContent()) ?? '')![0];
  const href = (await page.getByRole('link', {name: /View its profile/}).getAttribute('href'))!;
  const agentId = href.split('/').pop()!;
  const agent = (await apiFetch(`/v1/agents/${agentId}`)) as {chainAgentId: string; walletAddress: string};
  await eventually(
    () => chainView<{wallet: string | null}>('get_agent', {agent_id: Number(agent.chainAgentId)}),
    (a) => a?.wallet === agent.walletAddress,
    'agent wallet accepted on chain',
  );
  return {owner, name, agentId, chainAgentId: String(agent.chainAgentId), apiKey};
}

const hireCard = (page: Page) => page.getByRole('region', {name: 'Hire this agent'});

test('person → agent: "Hire this agent" on its page, create_job from the wallet, the agent delivers by API, the person approves', async ({
  browser,
}, info) => {
  const agent = await registerInPage(browser, info, 'hireme');
  await depositInto(agent.owner.account, agent.chainAgentId, STAKE(), 'Stake');
  await agent.owner.context.close();
  expect(
    (await chainView<{hireable: boolean}>('stake_of', {agent_id: Number(agent.chainAgentId)})).hireable,
  ).toBe(true);
  const hirer = await apiPerson(`${s.tag}-hirer`, `Hana ${s.tag} ${facts.run.slice(-4)}`, {
    musdc: 5_000_000n,
    fund: 1_000_000n,
  });
  const user = await signedIn(browser, info, hirer.account);
  const {page} = user;

  await page.goto(`/agents/${agent.agentId}`);
  const card = hireCard(page);
  await expect(card).toBeVisible({timeout: 30_000});
  await expect(card.getByLabel(/^Price/)).toHaveValue('0.05');
  await card.getByLabel('What should the agent do?').fill('Photograph the bakery front on Main Street.');
  await card.getByRole('button', {name: 'Hire'}).click();
  await expect(card.getByTestId('will-sign-create')).toContainText(`create_job on ${facts.pactora}`, {
    timeout: 30_000,
  });
  await card.getByRole('button', {name: 'Sign and fund the job'}).click();
  await expect(card.getByTestId('hire-funded')).toContainText('Funded', {timeout: 90_000});
  const jobId = (await card.getByRole('link', {name: 'Open the job'}).getAttribute('href'))!
    .split('/')
    .pop()!;

  // What the wallet was asked to sign, and what the chain then holds.
  const sent = (await page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs)) as {
    actions: {params?: {methodName?: string}}[];
  }[];
  expect(sent.map((t) => t.actions[0]?.params?.methodName)).toEqual(['create_job']);
  const job = await eventually(
    async () => (await apiFetch(`/v1/jobs/${jobId}`)) as {chainJobId: string | null; amount: string},
    (j) => Boolean(j.chainJobId),
    'API job on chain',
  );
  expect(job.amount).toBe(PRICE);
  const created = await chainView<{state: string; amount: string; client: number; worker: number}>(
    'get_job',
    {
      job_id: Number(job.chainJobId),
    },
  );
  expect(created).toMatchObject({state: 'Created', amount: PRICE});
  expect(String(created.client)).toBe(hirer.chainAgentId);
  expect(String(created.worker)).toBe(agent.chainAgentId);

  // The agent, through its key (the signer signs for its wallet).
  await apiFetch(`/v1/jobs/${jobId}/accept`, {method: 'POST', token: agent.apiKey, body: {}});
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Accepted',
    'job accepted on chain',
  );
  await apiFetch(`/v1/jobs/${jobId}/result`, {
    method: 'POST',
    token: agent.apiKey,
    body: {output: {photo: 'bakery-front.jpg', note: 'Sign in focus.'}, producedAt: new Date().toISOString()},
  });
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Submitted',
    'job submitted on chain',
  );

  // The person approves in the page.
  await expect(async () => {
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole('button', {name: 'Approve and pay'})).toBeVisible({timeout: 5_000});
  }).toPass({timeout: 60_000, intervals: [2_000]});
  await page.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Settled',
    'job settled on chain',
  );
  await eventually(
    async () => ((await apiFetch(`/v1/jobs/${jobId}`)) as {state: string}).state,
    (st) => st === 'settled',
    'API job settled (indexer)',
  );
  await page.reload();
  await expect(page.locator('header').getByText('Settled', {exact: true}).first()).toBeVisible({
    timeout: 30_000,
  });
  // The chain's own events, each with its transaction. The sandbox has no
  // block explorer (networks.json), so its explorerUrl is not an absolute
  // link and the page shows none; on testnet each is "View transaction".
  const history = page.getByRole('region', {name: 'History'});
  for (const step of [
    'Job created on chain',
    'Accepted on chain',
    'Result submitted on chain',
    'Settled on chain',
  ])
    await expect(history.getByText(step)).toBeVisible({timeout: 30_000});
  const detail = (await apiFetch(`/v1/jobs/${jobId}`)) as {
    events: {kind: string; txHash: string | null; explorerUrl: string | null}[];
  };
  const onChainEvents = detail.events.filter((e) => e.txHash);
  expect(onChainEvents.length).toBeGreaterThanOrEqual(4);
  for (const e of onChainEvents) expect(e.txHash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  const linkable = detail.events.filter((e) => /^https:\/\//.test(e.explorerUrl ?? '')).length;
  await expect(history.getByRole('link', {name: 'View transaction'})).toHaveCount(linkable);
  await user.context.close();
});

test('agent → person: an agent posts and selects through its key, the person bids and delivers in the page, the agent pays', async ({
  browser,
}, info) => {
  const agent = await registerInPage(browser, info, 'poster', {fund: '1'});
  await agent.owner.context.close();
  const worker = await apiPerson(`${s.tag}-agworker`, `Ada ${s.tag} ${facts.run.slice(-4)}`, {
    stake: STAKE(),
    musdc: STAKE(),
  });
  const title = `Agent's bakery ${s.tag} ${facts.run.slice(-4)}`;
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: agent.apiKey,
    headers: {'idempotency-key': `agent-listing-${s.tag}-${facts.run}`},
    body: listingBody(title),
  })) as {listingId: string};

  const user = await signedIn(browser, info, worker.account);
  const {page} = user;
  await bid(page, listing.listingId);
  await expect(page.getByTestId('my-bid')).toContainText('pending', {timeout: 30_000});

  // The agent selects through the API; its signer funds create_job from its purse.
  const apps = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {token: agent.apiKey})) as {
    applications: {applicationId: string; applicant: {name: string}}[];
  };
  const mine = apps.applications.find((a) => a.applicant.name === worker.name)!;
  const decided = (await apiFetch(`/v1/listings/${listing.listingId}/decide`, {
    method: 'POST',
    token: agent.apiKey,
    body: {applicationId: mine.applicationId, action: 'select', reason: 'Lives next door, clear plan.'},
  })) as {job: {jobId: string}};
  const jobId = decided.job.jobId;
  const job = await eventually(
    async () => (await apiFetch(`/v1/jobs/${jobId}`)) as {chainJobId: string | null},
    (j) => Boolean(j.chainJobId),
    'agent-funded job on chain',
    90_000,
  );
  const onChain = await chainView<{state: string; client: number; worker: number; amount: string}>(
    'get_job',
    {
      job_id: Number(job.chainJobId),
    },
  );
  expect(onChain).toMatchObject({state: 'Created', amount: PRICE});
  expect(String(onChain.client)).toBe(agent.chainAgentId);
  expect(String(onChain.worker)).toBe(worker.chainAgentId);

  // The person accepts and delivers with a photo and a draft, in the page.
  await page.goto(`/jobs/${jobId}`);
  await expect(page.getByText('You are the worker').first()).toBeVisible({timeout: 30_000});
  await page.getByRole('button', {name: 'Accept the job'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  await eventually(
    () => chainView<{state: string}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Accepted',
    'job accepted on chain',
  );
  await page.reload();
  await page.locator('#photo-input').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: pngWithMark(GPS_MARK),
  });
  await expect(page.getByRole('list', {name: 'Photos'}).getByRole('listitem')).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.locator('#draft-text').fill('Round 1: the bakery front in daylight, sign in focus.');
  await page.getByRole('button', {name: 'Post draft 1'}).click();
  await expect(page.getByTestId('draft-1')).toBeVisible({timeout: 30_000});

  // The agent reads the draft and its evidence, and accepts it, through its key.
  const drafts = (await apiFetch(`/v1/jobs/${jobId}/drafts`, {token: agent.apiKey})) as {
    drafts: {draftId: string; snapshotHash: string; snapshot?: {files?: unknown[]}}[];
  };
  const draft = drafts.drafts[0]!;
  const files = (await apiFetch(`/v1/jobs/${jobId}/files`, {token: agent.apiKey})) as {files: unknown[]};
  expect(files.files).toHaveLength(1);
  await apiFetch(`/v1/jobs/${jobId}/drafts/${draft.draftId}/review`, {
    method: 'POST',
    token: agent.apiKey,
    body: {
      snapshotHash: draft.snapshotHash,
      decision: 'accept_draft',
      reason: 'The photo shows the whole front and the sign.',
      checks: [{criterion: CRITERIA, met: true, support: 'draft 1 photo'}],
    },
  });

  // The person submits the accepted draft on chain.
  const before = await chainView<{balance: string}>('purse_of', {agent_id: Number(worker.chainAgentId)});
  await page.reload();
  await page.getByRole('button', {name: 'Sign and submit the accepted draft'}).click();
  await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
  const delivered = await eventually(
    () => chainView<{state: string; result_hash: string | null}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Submitted' || j.state === 'Settled',
    'job submitted on chain',
  );
  // What went on chain is the snapshot the agent accepted.
  const bare = (h: string | null) =>
    String(h ?? '')
      .replace(/^0x/, '')
      .toLowerCase();
  expect(bare(delivered.result_hash)).toBe(bare(draft.snapshotHash));

  // The agent approves through its key. For an agent client its accepted
  // draft already is its approval: the API's draft-settle sweep (app.ts,
  // every 15 s) approves a submitted accepted draft by itself, so the job may
  // be settled before this call, which is then refused as not submitted.
  const approve = await apiRaw(`/v1/jobs/${jobId}/approve`, {method: 'POST', token: agent.apiKey, body: {}});
  expect([200, 202, 409], await approve.clone().text()).toContain(approve.status);
  const settled = await eventually(
    () => chainView<{state: string; fee: string}>('get_job', {job_id: Number(job.chainJobId)}),
    (j) => j.state === 'Settled',
    'job settled on chain',
    90_000,
  );
  const after = await chainView<{balance: string}>('purse_of', {agent_id: Number(worker.chainAgentId)});
  expect(BigInt(after.balance) - BigInt(before.balance)).toBe(BigInt(PRICE) - BigInt(settled.fee));
  await eventually(
    async () => ((await apiFetch(`/v1/jobs/${jobId}`)) as {state: string}).state,
    (st) => st === 'settled',
    'API job settled (indexer)',
  );
  await page.reload();
  await expect(page.locator('header').getByText('Settled', {exact: true}).first()).toBeVisible({
    timeout: 30_000,
  });
  await user.context.close();
});

test('owner: My agents on /me lists the registered agent and leads to its manage page; its page shows Manage', async ({
  browser,
}, info) => {
  const agent = await registerInPage(browser, info, 'mine');
  const owner = agent.owner;
  await signIn(owner);
  const {page} = owner;
  await page.goto('/me');
  const card = page.getByRole('region', {name: 'My agents'});
  const row = card.getByRole('listitem').filter({hasText: agent.name});
  await expect(row).toHaveCount(1, {timeout: 30_000});
  await expect(row.getByRole('link', {name: agent.name, exact: true})).toHaveAttribute(
    'href',
    `/agents/${agent.agentId}`,
  );
  const manage = row.getByRole('link', {name: `Manage ${agent.name}`});
  await expect(manage).toHaveAttribute('href', `/agents/${agent.chainAgentId}/manage`);
  await manage.click();
  await page.waitForURL(new RegExp(`/agents/${agent.chainAgentId}/manage$`), {timeout: 30_000});
  await expect(page.locator('#fund-amount')).toBeVisible({timeout: 30_000});

  await page.goto(`/agents/${agent.agentId}`);
  await expect(page.getByRole('link', {name: 'Manage', exact: true})).toHaveAttribute(
    'href',
    `/agents/${agent.chainAgentId}/manage`,
    {timeout: 30_000},
  );
  await expect(hireCard(page)).toHaveCount(0);
  await owner.context.close();
});

test('person client: a selection never funded shows "Needs funding" after a reload; Release opens the slot and the other bids again', async ({
  browser,
}, info) => {
  const client = await apiPerson(`${s.tag}-nfclient`, `Nina ${s.tag} ${facts.run.slice(-4)}`, {
    musdc: 2_000_000n,
    fund: 1_000_000n,
  });
  const worker = await apiPerson(`${s.tag}-nfworker`, `Nils ${s.tag} ${facts.run.slice(-4)}`, {
    stake: STAKE(),
    musdc: STAKE(),
  });
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: client.token,
    headers: {'idempotency-key': `unfunded-${s.tag}-${facts.run}`},
    body: listingBody(`Unfunded ${s.tag} ${facts.run.slice(-4)}`),
  })) as {listingId: string};
  const application = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {
    method: 'POST',
    token: worker.token,
    body: {action: 'apply', priceBaseUnits: PRICE, proposal: 'Around the corner, can do it today.'},
  })) as {applicationId: string};
  // A second bid, to pick instead once the first selection is released.
  const other = await apiPerson(`${s.tag}-nfother`, `Nora ${s.tag} ${facts.run.slice(-4)}`, {
    stake: STAKE(),
    musdc: STAKE(),
  });
  const otherBid = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {
    method: 'POST',
    token: other.token,
    body: {action: 'apply', priceBaseUnits: PRICE, proposal: 'I pass the bakery every morning.'},
  })) as {applicationId: string};

  const user = await signedIn(browser, info, client.account);
  const {page} = user;
  await page.goto(`/jobs/listing/${listing.listingId}`);
  const selectButton = page.getByRole('button', {name: `Select ${worker.name}`}).filter({visible: true});
  await selectButton.first().click();
  await page.locator('#decide-reason').fill('Closest to the shop and a fair price.');
  await page.getByRole('button', {name: 'Confirm selection'}).click();
  await expect(page.getByRole('heading', {name: 'Fund the job'})).toBeVisible({timeout: 30_000});
  // Not funded: the job exists off chain only.
  const selected = (await apiFetch(`/v1/listings/${listing.listingId}`)) as {status: string};
  expect(selected.status).toBe('filled');

  await page.reload();
  const slots = page.getByRole('list', {name: 'Slots'});
  await expect(slots).toContainText('Needs funding', {timeout: 30_000});
  await page.getByRole('button', {name: 'Release slot 1'}).click();
  await expect(page.getByTestId('released')).toContainText('released', {timeout: 30_000});
  await expect(slots).not.toContainText('Needs funding');
  // The slot is open and the other bid can be selected; the released bid is
  // closed with the API's reason, so its bidder is told (listings.ts UNSELECTED_REASON).
  await expect(page.getByText('0 of 1 filled').first()).toBeVisible({timeout: 30_000});
  await expect(page.getByRole('button', {name: `Select ${other.name}`}).first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(
    page.getByText('The client released the selection before the job was funded.').first(),
  ).toBeAttached();

  // What the API holds: the listing open again, nothing on chain, nothing signed.
  const after = (await apiFetch(`/v1/listings/${listing.listingId}`)) as {
    status: string;
    slotsFilled: number;
  };
  expect(after).toMatchObject({status: 'open', slotsFilled: 0});
  const bids = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {token: client.token})) as {
    applications: {applicationId: string; status: string}[];
  };
  const statusOf = (id: string) => bids.applications.find((a) => a.applicationId === id)?.status;
  expect(statusOf(application.applicationId)).toBe('rejected');
  expect(statusOf(otherBid.applicationId)).toBe('pending');
  expect(await page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs.length)).toBe(0);
  const purse = await chainView<{balance: string}>('purse_of', {agent_id: Number(client.chainAgentId)});
  expect(purse.balance).toBe('1000000');
  await user.context.close();
});

test('a person reports a listing; a compliance reviewer blocks it on /admin; it leaves the board', async ({
  browser,
}, info) => {
  // A listing reserves its price against the poster's purse: fund it first.
  const poster = await apiPerson(`${s.tag}-spammer`, `Sam ${s.tag} ${facts.run.slice(-4)}`, {
    musdc: 2_000_000n,
    fund: 1_000_000n,
  });
  const reporter = await apiPerson(`${s.tag}-reporter`, `Rita ${s.tag} ${facts.run.slice(-4)}`);
  const title = `Too good to be true ${s.tag} ${facts.run.slice(-4)}`;
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: poster.token,
    headers: {'idempotency-key': `spam-${s.tag}-${facts.run}`},
    body: listingBody(title),
  })) as {listingId: string};
  const onBoard = async () =>
    (
      (await apiFetch(`/v1/listings?q=${encodeURIComponent(title)}`)) as {listings: {listingId: string}[]}
    ).listings.some((l) => l.listingId === listing.listingId);
  expect(await onBoard()).toBe(true);

  const r = await signedIn(browser, info, reporter.account);
  await r.page.goto(`/jobs/listing/${listing.listingId}`);
  await expect(r.page.getByRole('heading', {name: title})).toBeVisible({timeout: 30_000});
  await r.page.getByRole('button', {name: 'Report', exact: true}).first().click();
  const form = r.page.getByRole('form', {name: 'Report this listing'});
  await form.getByLabel(/Why are you reporting/).selectOption('scam');
  await form.getByLabel('Details (optional)').fill('Asks bidders to pay a fee first, off the platform.');
  await form.getByRole('button', {name: 'Send the report'}).click();
  await expect(r.page.getByTestId('report-sent')).toBeVisible({timeout: 30_000});
  await r.context.close();

  const reviewer = await signedIn(browser, info, facts.reviewers[0]!);
  const {page} = reviewer;
  await page.goto('/admin');
  await expect(page.getByTestId('admin-roles')).toContainText('Compliance reviewer', {timeout: 30_000});
  await page.getByRole('tab', {name: 'Reports'}).click();
  const item = page
    .getByRole('list', {name: 'Reports'})
    .getByRole('listitem')
    .filter({hasText: listing.listingId});
  await expect(item).toContainText('scam', {timeout: 30_000});
  await expect(item).toContainText('pay a fee first');
  await item.getByRole('button', {name: 'Block', exact: true}).click();
  await item.getByLabel('Note (3-500 characters)').fill('Fee-first scam, confirmed from the listing text.');
  await item.getByRole('button', {name: 'Confirm: Block'}).click();
  await expect(item).toHaveCount(0, {timeout: 30_000});
  await reviewer.context.close();

  // The poster is blocked, and the listing is off the board (API and page).
  const kyc = (await apiFetch('/v1/kyc', {token: poster.token})) as {standing: string};
  expect(kyc.standing).toBe('blocked');
  await eventually(onBoard, (v) => v === false, 'listing off the board', 15_000);
  const v = await userContext(browser, info, null);
  await v.page.goto('/jobs');
  await expect(v.page.getByRole('heading').first()).toBeVisible();
  await v.page.waitForLoadState('networkidle').catch(() => {});
  await expect(v.page.getByText(title)).toHaveCount(0);
  await v.context.close();
});

test('/me: Export my data downloads a JSON file that names the person’s account', async ({browser}, info) => {
  const person = await apiPerson(`${s.tag}-exporter`, `Edda ${s.tag} ${facts.run.slice(-4)}`);
  const user = await signedIn(browser, info, person.account);
  const {page} = user;
  await page.goto('/me#settings');
  const button = page.getByRole('button', {name: 'Export my data'});
  await expect(button).toBeVisible({timeout: 30_000});
  const [download] = await Promise.all([page.waitForEvent('download', {timeout: 30_000}), button.click()]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const path = await download.path();
  const text = readFileSync(path!, 'utf8');
  const data = JSON.parse(text) as unknown;
  expect(JSON.stringify(data)).toContain(person.account);
  expect(JSON.stringify(data)).toContain(person.name);
  await user.context.close();
});

test('job page: a funded job shows the deadlines the chain holds (get_job), with the keeper line', async ({
  browser,
}, info) => {
  const client = await apiPerson(`${s.tag}-dlclient`, `Dora ${s.tag} ${facts.run.slice(-4)}`, {
    musdc: 2_000_000n,
    fund: 1_000_000n,
  });
  const worker = await apiPerson(`${s.tag}-dlworker`, `Dirk ${s.tag} ${facts.run.slice(-4)}`, {
    stake: STAKE(),
    musdc: STAKE(),
  });
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: client.token,
    headers: {'idempotency-key': `deadlines-${s.tag}-${facts.run}`},
    body: listingBody(`Deadlines ${s.tag} ${facts.run.slice(-4)}`),
  })) as {listingId: string};
  const application = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {
    method: 'POST',
    token: worker.token,
    body: {action: 'apply', priceBaseUnits: PRICE, proposal: 'Can photograph it this afternoon.'},
  })) as {applicationId: string};
  const decided = (await apiFetch(`/v1/listings/${listing.listingId}/decide`, {
    method: 'POST',
    token: client.token,
    body: {applicationId: application.applicationId, action: 'select', reason: 'Quick and close by.'},
  })) as {job: {jobId: string}};
  const jobId = decided.job.jobId;
  await personAction(client.token, client.account, jobId, 'create');
  const chainJobId = ((await apiFetch(`/v1/jobs/${jobId}`)) as {chainJobId: string}).chainJobId;
  const onChain = await chainView<{
    state: string;
    accept_deadline: number | string;
    work_deadline: number | string;
  }>('get_job', {job_id: Number(chainJobId)});
  expect(onChain.state).toBe('Created');
  const iso = (v: number | string) => new Date(Number(v) * 1000).toISOString();

  const user = await signedIn(browser, info, client.account);
  const {page} = user;
  await page.goto(`/jobs/${jobId}`);
  const card = page.getByTestId('job-deadlines');
  await expect(card.getByTestId('deadline-acceptBy')).toHaveText(utcText(iso(onChain.accept_deadline)), {
    timeout: 30_000,
  });
  await expect(card.getByTestId('deadline-workBy')).toHaveText(utcText(iso(onChain.work_deadline)));
  await expect(card).toContainText('Accept by');
  await expect(card).toContainText('Deliver by');
  await expect(card).toContainText('keeper');
  await user.context.close();
});

test.afterAll(async () => {
  await s.worker?.context.close();
  await s.client?.context.close();
});
