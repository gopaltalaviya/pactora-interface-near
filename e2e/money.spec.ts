import {expect, test, type Page, type Route, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, methods, MOCK_API, signInAs} from './helpers';

/**
 * Money clarity everywhere (2026-11-12): "Your money" on /me and on the
 * manage page, the faucet card that is never silently missing, a hire the
 * purse cannot pay stopped before anything is created or signed, and the job
 * page's bonds, fee and live countdown. The chain is answered by page.route
 * (both public testnet nodes, as in swarm.spec.ts). Each test failed on the
 * build before these changes.
 */

const json = (route: Route, body: unknown) =>
  route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

interface Chain {
  owner?: string;
  purseBalance?: string;
  walletToken?: string;
  registered?: boolean;
  frozen?: boolean;
  nextReleaseAt?: number;
  rpcDown?: boolean;
}

/** A NEAR node: view_account for the wallet, the token's views, and the Pactora record. */
async function mockChain(page: Page, c: Chain = {}) {
  const pactora: Record<string, unknown> = {
    get_agent: {
      owner: c.owner ?? 'owner.testnet',
      wallet: c.owner ?? 'owner.testnet',
      pending_wallet: null,
      frozen: c.frozen ?? false,
    },
    purse_of: {
      balance: c.purseBalance ?? '2500000',
      per_task_cap: '1000000',
      daily_cap: '2000000',
      spent_today: '0',
      daily_remaining: '2000000',
      next_release_at: c.nextReleaseAt ?? 0,
    },
    stake_of: {
      available: '12000000',
      pending: '0',
      unlock_at: 0,
      locked: '0',
      unlocked: '12000000',
      hireable: true,
    },
    storage_balance_of: '90000000000000000000000',
  };
  const token: Record<string, unknown> = {
    ft_balance_of: c.walletToken ?? '7500000',
    storage_balance_of: c.registered === false ? null : {total: '1250000000000000000000', available: '0'},
  };
  const handler = (route: Route) => {
    if (c.rpcDown) return route.abort();
    const body = JSON.parse(route.request().postData() ?? '{}');
    const p = body.params ?? {};
    if (p.request_type === 'view_account')
      return json(route, {
        jsonrpc: '2.0',
        id: body.id,
        result: {amount: '3000000000000000000000000', locked: '0', storage_usage: 182},
      });
    const answer = (p.account_id === 'musdc.pactora.testnet' ? token : pactora)[p.method_name];
    return json(route, {
      jsonrpc: '2.0',
      id: body.id,
      result: {result: Array.from(new TextEncoder().encode(JSON.stringify(answer ?? null))), logs: []},
    });
  };
  await page.route('https://rpc.testnet.near.org/**', handler);
  await page.route('https://test.rpc.fastnear.com/**', handler);
}

const who = (prefix: string, info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${Date.now() % 1e7}.testnet`;

async function asPerson(page: Page, info: TestInfo, prefix: string): Promise<string> {
  const account = who(prefix, info);
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  return account;
}

const panel = (page: Page) => page.getByRole('region', {name: 'Your money'});

test('/me: "Your money" shows the wallet, the purse and the stake, each with its meaning and a fix when low', async ({
  page,
}, info) => {
  await mockChain(page, {purseBalance: '0', registered: false, walletToken: '0'});
  await asPerson(page, info, 'money');
  await page.goto('/me');
  const money = panel(page);
  await expect(money.getByTestId('money-near')).toContainText('3 NEAR');
  await expect(money.getByTestId('money-token')).toContainText('0 USDC');
  await expect(money.getByTestId('money-registered')).toContainText('Not yet');
  await expect(money.getByTestId('money-registered').getByRole('link', {name: /faucet/})).toHaveAttribute(
    'href',
    '/me#faucet',
  );
  const purse = money.getByTestId('money-purse');
  await expect(purse).toContainText('0 USDC');
  await expect(purse).toContainText('Pays for the jobs you hire');
  await expect(purse.getByRole('link', {name: 'Fund your purse'})).toHaveAttribute(
    'href',
    '/agents/177/manage#fund-card',
  );
  await expect(money.getByTestId('money-stake')).toContainText('12 USDC');
  // Open jobs, summed from the API (the mock's people share one record, so the count varies).
  await expect(money.getByTestId('money-escrow')).toContainText(
    /No open job holds your money|open jobs?: paid to the worker/,
  );
});

test('/me: an RPC node that cannot be reached is said on each line, never a blank panel', async ({
  page,
}, info) => {
  await mockChain(page, {rpcDown: true});
  await asPerson(page, info, 'rpcdown');
  await page.goto('/me');
  const near = panel(page).getByTestId('money-near');
  await expect(near).toContainText('Could not be read');
  await expect(near).toContainText('Refresh');
});

test('/me: a server with no faucet says so, with what to do and the NEAR faucet for gas', async ({
  page,
}, info) => {
  await mockChain(page);
  const account = await asPerson(page, info, 'nofaucet');
  expect((await page.request.post(`${MOCK_API}/__test/faucet/${account}/none`)).ok()).toBe(true);
  await page.goto('/me#faucet');
  const card = page.getByRole('region', {name: /faucet is not available on this server/});
  await expect(card).toBeInViewport();
  await expect(card).toContainText('no test-token faucet set up');
  await expect(card.getByRole('link', {name: /NEAR testnet faucet/})).toHaveAttribute(
    'href',
    'https://near-faucet.io/',
  );
});

test('/me: a faucet that cannot be read is a card with a retry, not nothing', async ({page}, info) => {
  await mockChain(page);
  const account = await asPerson(page, info, 'faucetdown');
  expect((await page.request.post(`${MOCK_API}/__test/faucet/${account}/down`)).ok()).toBe(true);
  await page.goto('/me');
  const card = page.getByTestId('faucet-unavailable');
  await expect(card).toContainText('could not say whether it has a faucet');
  expect((await page.request.post(`${MOCK_API}/__test/faucet/${account}/available`)).ok()).toBe(true);
  await card.getByRole('button', {name: 'Try again'}).click();
  const ok = page.getByRole('region', {name: 'Test tokens'});
  await expect(ok.getByTestId('faucet-remaining')).toContainText('495 USDC more today');
  await expect(ok.getByRole('button', {name: 'Claim test tokens'})).toBeEnabled();
});

test('manage: the wallet beside Fund and Stake, Max fills an amount, and when more of the allowance frees up', async ({
  page,
}, info) => {
  const account = await asPerson(page, info, 'manage');
  const at = Math.floor(Date.UTC(2099, 0, 1, 12) / 1000);
  await mockChain(page, {owner: account, nextReleaseAt: at});
  // A fix link lands on its card, even as the panels above it finish loading.
  await page.goto('/agents/177/manage#fund-card');
  const fund = page.getByRole('region', {name: 'Fund the purse'});
  await expect(fund).toBeInViewport();
  await expect(fund).toContainText('In your wallet: 7.5 USDC.');
  await fund.getByRole('button', {name: /^Max fund amount/}).click();
  await expect(fund.getByLabel(/Amount/)).toHaveValue('7.5');
  const withdraw = page.getByRole('region', {name: 'Withdraw from the purse'});
  await withdraw.getByRole('button', {name: /^Max withdraw amount/}).click();
  await expect(withdraw.getByLabel(/Amount/)).toHaveValue('2.5');
  await expect(page.getByRole('region', {name: 'Purse', exact: true})).toContainText(
    'Thu, 01 Jan 2099 12:00:00 GMT',
  );
  await expect(panel(page).getByTestId('money-token')).toContainText('7.5 USDC');
});

// Found in the manual live test of 2026-11-13: 6 mUSDC typed into Fund with 5
// in the wallet left the button enabled; the transaction would only fail on
// chain, after the wallet prompt and the gas. Over the known most, say so and
// send nothing.
test('manage: an amount over what you hold is refused in the form, and no transaction goes out', async ({
  page,
}, info) => {
  const account = await asPerson(page, info, 'overmax');
  await mockChain(page, {owner: account});
  await page.goto('/agents/177/manage');
  const fund = page.getByRole('region', {name: 'Fund the purse'});
  await expect(fund).toContainText('In your wallet: 7.5 USDC.');
  await fund.getByLabel(/Amount/).fill('8');
  await expect(fund).toContainText('More than you have: at most 7.5 USDC.');
  await expect(fund.getByRole('button', {name: 'Fund', exact: true})).toBeDisabled();
  const withdraw = page.getByRole('region', {name: 'Withdraw from the purse'});
  await withdraw.getByLabel(/Amount/).fill('3');
  await expect(withdraw).toContainText('More than you have: at most 2.5 USDC.');
  await expect(withdraw.getByRole('button', {name: 'Withdraw', exact: true})).toBeDisabled();
  await fund.getByLabel(/Amount/).fill('7.5');
  await expect(fund.getByRole('button', {name: 'Fund', exact: true})).toBeEnabled();
  expect(await methods(page)).toEqual([]);
});

test('manage: a frozen agent says what it means, and its owner can unfreeze it', async ({page}, info) => {
  const account = await asPerson(page, info, 'frozen');
  await mockChain(page, {owner: account, frozen: true});
  await page.goto('/agents/177/manage');
  const frozen = page.getByTestId('agent-frozen');
  await expect(frozen).toContainText('nobody can hire it');
  await frozen.getByRole('button', {name: 'Unfreeze'}).click();
  await expect(page.getByText('Unfreeze sent.')).toBeVisible();
  expect(await methods(page)).toEqual(['unfreeze_agent']);
});

test('hire: a purse that cannot pay blocks the hire before anything is created, with the fix', async ({
  page,
}, info) => {
  await mockChain(page, {purseBalance: '5000'});
  await asPerson(page, info, 'poor');
  await page.goto('/agents/1');
  const card = page.getByRole('region', {name: 'Hire this agent'});
  await card.getByLabel('What should the agent do?').fill('Summarise NEAR/USDC liquidity this week.');
  const why = card.getByTestId('hire-money-blocked');
  await expect(why).toContainText('Your purse holds 0.005 USDC, and this job needs 0.02 USDC.');
  await expect(why.getByRole('link', {name: 'Fund your purse'})).toHaveAttribute(
    'href',
    '/agents/177/manage#fund-card',
  );
  await expect(card.getByRole('button', {name: 'Hire'})).toBeDisabled();
  // The summary says what would be locked, the fee (from the worker's pay) and the bonds.
  await expect(card.getByTestId('spend-summary-fee')).toContainText('0.0002 USDC');
  await expect(card.getByTestId('spend-summary-bond')).toContainText('0.01 USDC');
  expect(await methods(page)).toEqual([]);
});

test('job: the fee fixed at creation, the bonds the contract holds, and a live countdown for who acts next', async ({
  page,
}) => {
  await page.goto('/jobs/aaaaaaaa-0000-4000-8000-000000000070');
  await expect(page.getByTestId('fact-protocol-fee')).toHaveText('0.04 USDC');
  await expect(page.getByTestId('fact-worker-receives')).toHaveText('3.96 USDC');
  await expect(page.getByTestId('fact-worker-bond')).toHaveText('0.8 USDC, locked from the worker’s stake');
  await expect(page.getByTestId('fact-dispute-bond')).toHaveText('0.4 USDC, only if the client disputes');
  const next = page.getByTestId('job-next-step');
  await expect(next).toContainText('Next: the worker delivers the result.');
  await expect(next).toContainText('receives the worker’s bond');
  await expect(next.getByRole('timer')).toHaveText(/^\d+ d \d+ h left$/);
  await expect(next.getByRole('timer')).toHaveAttribute('datetime', '2099-01-01T12:00:00.000Z');
});

test('job: an API without the new fields still reads, by the network’s rule', async ({page}) => {
  await page.goto('/jobs/aaaaaaaa-0000-4000-8000-000000000071');
  await expect(page.getByTestId('fact-protocol-fee')).toHaveText('0.04 USDC (by the network’s rule)');
  await expect(page.getByTestId('fact-worker-bond')).toContainText('(by the network’s rule)');
});

test('accessibility: /me with the money panel and the faucet card', async ({page}, info) => {
  await mockChain(page, {purseBalance: '0'});
  await asPerson(page, info, 'a11ymoney');
  await page.goto('/me');
  await expect(panel(page).getByTestId('money-purse')).toBeVisible();
  await expect(page.getByRole('region', {name: 'Test tokens'})).toBeVisible();
  await expectNoBlockingViolations(page, '/me with Your money');
});

test('accessibility: the manage page of your own record', async ({page}, info) => {
  const account = await asPerson(page, info, 'a11ymanage');
  await mockChain(page, {owner: account, frozen: true});
  await page.goto('/agents/177/manage');
  await expect(page.getByTestId('agent-frozen')).toBeVisible();
  await expectNoBlockingViolations(page, 'the manage page');
});
