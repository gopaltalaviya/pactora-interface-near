import {expect, test, type Page, type Route} from '@playwright/test';
import {MOCK_API, methods, signInAs} from './helpers';

/**
 * 2026-11-10: a person hires an agent directly from its page (POST
 * /v1/jobs/hire, then the person's wallet signs create_job), the agents an
 * account owns on /me with their Manage links, the Manage button on an
 * agent's page for its owner, and the manage page of a person's own record.
 * The chain is answered by page.route, as in keys.spec.ts. Each test failed
 * on the old build.
 */

const json = (route: Route, body: unknown) =>
  route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

/** The NEAR RPC: `get_agent` names `owner`, `stake_of` says whether the agent is hireable. */
async function mockChain(page: Page, {owner = 'owner.testnet', hireable = true} = {}) {
  const answers: Record<string, unknown> = {
    get_agent: {owner, wallet: owner, pending_wallet: null, frozen: false},
    purse_of: {
      balance: '2500000',
      per_task_cap: '100000',
      daily_cap: '1000000',
      spent_today: '0',
      daily_remaining: '1000000',
      next_release_at: 0,
    },
    stake_of: {
      available: hireable ? '12000000' : '0',
      pending: '0',
      unlock_at: 0,
      locked: '0',
      unlocked: hireable ? '12000000' : '0',
      hireable,
    },
    storage_balance_of: '90000000000000000000000',
  };
  await page.route('https://rpc.testnet.near.org/**', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    const method = body.params?.method_name as string;
    return json(route, {
      jsonrpc: '2.0',
      id: body.id,
      result: {result: Array.from(new TextEncoder().encode(JSON.stringify(answers[method]))), logs: []},
    });
  });
}

let n = 0;
/** A person of the test's own, so parallel browsers never share one. */
async function asPerson(page: Page, project: string) {
  const account = `hire-${project.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Date.now() % 1e7}-${++n}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  return account;
}

const hireCard = (page: Page) => page.getByRole('region', {name: 'Hire this agent'});

test('signed out, the hire card asks to sign in first', async ({page}) => {
  await page.goto('/agents/1');
  const card = hireCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', {name: 'Sign in to hire'})).toHaveAttribute(
    'href',
    '/signin?next=%2Fagents%2F1',
  );
  await expect(card.getByRole('button', {name: 'Hire'})).toHaveCount(0);
});

test('signed in without a person record, the hire card sends you to join', async ({page}) => {
  await signInAs(page, 'stranger-hire.testnet');
  await page.goto('/agents/1');
  const card = hireCard(page);
  await expect(card.getByRole('link', {name: 'Join as a person'})).toHaveAttribute('href', '/join');
  await expect(card.getByLabel('What should the agent do?')).toHaveCount(0);
});

test('a person hires an agent directly: the price is prefilled, checked, and the wallet funds the job', async ({
  page,
}, info) => {
  await mockChain(page);
  await asPerson(page, info.project.name);
  await page.goto('/agents/1');
  const card = hireCard(page);
  // Prefilled from the agent's pricePerTask (20000 base units).
  await expect(card.getByLabel(/^Price/)).toHaveValue('0.02');
  await expect(card.getByLabel('Skill')).toHaveValue('market-research');

  // The same checks as a bid: an empty task and a zero price are refused before the API.
  await card.getByLabel(/^Price/).fill('0');
  await card.getByRole('button', {name: 'Hire'}).click();
  await expect(card.getByText('Describe the task.')).toBeVisible();
  await expect(card.getByText(/Enter an amount above 0/)).toBeVisible();

  await card.getByLabel('What should the agent do?').fill('Summarise NEAR/USDC liquidity this week.');
  await card.getByLabel(/^Price/).fill('0.05');
  const sent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/v1/jobs/hire'));
  await card.getByRole('button', {name: 'Hire'}).click();
  const body = (await sent).postDataJSON();
  expect(body).toMatchObject({
    workerAgentId: '1',
    amount: '50000',
    task: 'Summarise NEAR/USDC liquidity this week.',
    capability: 'market-research',
  });
  expect(body.idempotencyKey).toEqual(expect.any(String));

  await expect(card.getByTestId('will-sign-create')).toContainText('create_job on pactora.testnet');
  await card.getByRole('button', {name: 'Sign and fund the job'}).click();
  await expect(card.getByTestId('hire-funded')).toContainText('Funded');
  expect(await methods(page)).toEqual(['create_job']);
  const open = card.getByRole('link', {name: 'Open the job'});
  await expect(open).toHaveAttribute('href', /^\/jobs\/[0-9a-f-]{36}$/);
});

test('a price above what one job may hold is refused before the API; the API’s refusal is shown in words', async ({
  page,
}, info) => {
  await mockChain(page);
  const account = await asPerson(page, info.project.name);
  await page.goto('/agents/1');
  const card = hireCard(page);
  await card.getByLabel('What should the agent do?').fill('A big job.');
  // Above the network's maxJobAmount (10): refused here, as a bid above the ceiling is.
  await card.getByLabel(/^Price/).fill('11');
  let asked = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/jobs/hire')) asked++;
  });
  await card.getByRole('button', {name: 'Hire'}).click();
  await expect(card.getByText(/A job holds at most 10/)).toBeVisible();
  expect(asked).toBe(0);

  // On hold: the API answers 403 COUNTERPARTY_BLOCKED, and the card says so.
  expect((await page.request.post(`${MOCK_API}/__test/standing/${account}/hold`)).ok()).toBe(true);
  // Within the purse's per-task cap (0.1), so the money pre-check lets the API answer.
  await card.getByLabel(/^Price/).fill('0.05');
  await card.getByRole('button', {name: 'Hire'}).click();
  await expect(card.getByRole('alert')).toContainText(/on hold/);
  await expect(card.getByRole('button', {name: 'Sign and fund the job'})).toHaveCount(0);
  expect(await methods(page)).toEqual([]);
});

test('an agent that is not hireable (stake below the minimum) cannot be hired, and says why', async ({
  page,
}, info) => {
  await mockChain(page, {hireable: false});
  await asPerson(page, info.project.name);
  await page.goto('/agents/1');
  const card = hireCard(page);
  await expect(card.getByTestId('hire-blocked')).toContainText('stake is below the network minimum');
  await expect(card.getByRole('button', {name: 'Hire'})).toBeDisabled();
});

test('an agent with no on-chain record cannot be hired', async ({page}, info) => {
  await asPerson(page, info.project.name);
  await page.goto('/agents/2');
  const card = hireCard(page);
  await expect(card.getByTestId('hire-blocked')).toContainText('not registered on chain');
  await expect(card.getByRole('button', {name: 'Hire'})).toBeDisabled();
});

test('the owner sees Manage on their agent’s page, not a hire card', async ({page}) => {
  await mockChain(page);
  await signInAs(page, 'owner.testnet');
  await page.goto('/agents/1');
  // The manage page is keyed by the CONTRACT's id (42), not the marketplace's (1).
  await expect(page.getByRole('link', {name: 'Manage'})).toHaveAttribute('href', '/agents/42/manage');
  await expect(hireCard(page)).toHaveCount(0);
});

test('a stranger sees no Manage link', async ({page}, info) => {
  await mockChain(page);
  await asPerson(page, info.project.name);
  await page.goto('/agents/1');
  await expect(hireCard(page)).toBeVisible();
  await expect(page.getByRole('link', {name: 'Manage', exact: true})).toHaveCount(0);
});

test('/me lists the agents the account owns, each with its profile and its manage page', async ({page}) => {
  await signInAs(page, 'owner.testnet');
  await page.goto('/me');
  const card = page.getByRole('region', {name: 'My agents'});
  const rows = card.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole('link', {name: 'ResearchBot', exact: true})).toHaveAttribute(
    'href',
    '/agents/1',
  );
  await expect(rows.nth(0).getByRole('link', {name: 'Manage ResearchBot'})).toHaveAttribute(
    'href',
    '/agents/42/manage',
  );
  // No on-chain id: no manage page to link.
  await expect(rows.nth(1)).toContainText('not registered on chain');
  await expect(rows.nth(1).getByRole('link', {name: /^Manage/})).toHaveCount(0);
  // Not a person: no "Post a listing" offer.
  await expect(page.getByRole('link', {name: 'Post a listing'})).toHaveCount(0);
});

test('a person’s /me offers Post a listing; their record is managed by its on-chain id', async ({
  page,
}, info) => {
  await asPerson(page, info.project.name);
  await page.goto('/me');
  await expect(page.getByRole('link', {name: 'Post a listing'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Fund and stake'})).toHaveAttribute(
    'href',
    '/agents/177/manage',
  );
});

test('the manage page of your own person record speaks of you, links back to /me and to the faucet', async ({
  page,
}, info) => {
  const account = await asPerson(page, info.project.name);
  await mockChain(page, {owner: account, hireable: false});
  await page.goto('/agents/177/manage');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Your person record');
  await expect(page.getByRole('link', {name: 'My account'}).first()).toHaveAttribute('href', '/me');
  const stake = page.getByRole('region', {name: 'Stake'});
  await expect(stake.getByRole('link', {name: /faucet/i})).toHaveAttribute('href', '/me#faucet');
  await expect(page.getByText(/On-chain agent 177/)).toHaveCount(0);
});
