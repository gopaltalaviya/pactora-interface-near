import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page, type Route} from '@playwright/test';

/**
 * People: sign in, join, and the owner's manage page, in a real browser.
 *
 * The wallet is scripted (`window.__pactoraTestWallet`, honoured only by a
 * build made with NEXT_PUBLIC_E2E_WALLET=1, which `pnpm test:e2e` does): the
 * real connector runs third-party wallet code in iframes a test cannot drive.
 * It records every transaction it is asked to sign in `window.__txs`, so the
 * tests assert on exactly what a wallet would have shown the person. The chain
 * is a stand-in too: the NEAR RPC is answered by `page.route`. None of this
 * proves the contract's behaviour: that is pactora-contracts-near's job.
 */

type Tx = {
  receiverId: string;
  actions: {params: {methodName: string; args: Record<string, unknown>; deposit: string}}[];
};

async function installWallet(page: Page, account = 'alice.testnet') {
  await page.addInitScript((accountId) => {
    const w = window as unknown as {
      __txs: unknown[];
      __failNext: string | null;
      __pactoraTestWallet: unknown;
    };
    w.__txs = [];
    w.__failNext = null;
    let hash = 0;
    w.__pactoraTestWallet = {
      accountId,
      wallet: {
        getAccounts: async () => [{accountId}],
        signMessage: async (p: {signerId?: string}) => ({
          accountId: p.signerId ?? accountId,
          publicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp',
          signature: 'c2ln',
        }),
        signAndSendTransactions: async (p: {transactions: {actions: {params: {methodName: string}}[]}[]}) => {
          return p.transactions.map((tx) => {
            w.__txs.push(tx);
            const method = tx.actions[0]?.params.methodName;
            if (w.__failNext === method) {
              w.__failNext = null;
              return {status: {Failure: {ActionError: 'refused by the test chain'}}};
            }
            return {
              status: {SuccessValue: btoa(method === 'register_agent' ? '17' : '')},
              transaction: {hash: `TXHASH${++hash}`},
            };
          });
        },
      },
    };
  }, account);
}

const txs = (page: Page) =>
  page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs) as Promise<Tx[]>;
const methods = async (page: Page) => (await txs(page)).map((t) => t.actions[0]!.params.methodName);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toBeVisible();
}

const json = (route: Route, body: unknown) =>
  route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

/** The NEAR RPC, answering the view calls the manage page makes. */
async function mockChain(
  page: Page,
  opts: {owner?: string; stake?: Record<string, unknown>; purse?: Record<string, unknown>} = {},
) {
  const answers: Record<string, unknown> = {
    get_agent: {
      id: 7,
      owner: opts.owner ?? 'alice.testnet',
      wallet: 'alice.testnet',
      pending_wallet: null,
      card_uri: 'data:,',
      frozen: false,
      registered_at: 1,
    },
    purse_of: opts.purse ?? {
      balance: '2500000',
      per_task_cap: '100000',
      daily_cap: '1000000',
      spent_today: '20000',
      daily_remaining: '980000',
      next_release_at: 0,
    },
    stake_of: opts.stake ?? {
      available: '12000000',
      pending: '0',
      unlock_at: 0,
      locked: '0',
      unlocked: '12000000',
      hireable: true,
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

// ── sign in ────────────────────────────────────────────────────────────────

test('sign in: the wallet signs, the header shows the account, a reload keeps it, sign out ends it', async ({
  page,
}) => {
  await installWallet(page);
  await page.goto('/signin');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Sign in');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toHaveText('alice.testnet');
  await expect(page.getByText('Session ends')).toBeVisible();
  // The header names the account (shown from the small breakpoint up).
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    await expect(
      page.getByRole('banner').getByRole('button', {name: /Account menu for alice\.testnet/}),
    ).toBeVisible();
  }
  // The token lives in sessionStorage (this tab only), never localStorage.
  const stored = await page.evaluate(() => ({
    session: window.sessionStorage.getItem('pactora.session'),
    local: window.localStorage.length,
  }));
  expect(stored.session).toContain('ps_alice.testnet_');
  expect(stored.local).toBe(0);

  await page.reload();
  await expect(page.getByTestId('signed-in-account')).toHaveText('alice.testnet');

  const del = page.waitForRequest(
    (r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/v1/session',
  );
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  const request = await del;
  expect(request.headers()['authorization']).toMatch(/^Bearer ps_alice\.testnet_/);
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem('pactora.session'))).toBeNull();
});

test('sign out everywhere calls DELETE /v1/sessions', async ({page}) => {
  await installWallet(page);
  await signIn(page);
  const del = page.waitForRequest(
    (r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/v1/sessions',
  );
  await page.getByRole('button', {name: 'Sign out everywhere'}).click();
  await del;
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
});

test('a stored session the API no longer accepts is dropped, quietly', async ({page}) => {
  await installWallet(page);
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'pactora.session',
      JSON.stringify({token: `ps_expired.testnet_${'e'.repeat(32)}`, account: 'old.testnet', expiresAt: 'x'}),
    );
  });
  await page.goto('/signin');
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  await expect(page.getByTestId('signed-in-account')).toHaveCount(0);
});

test('sign in refuses a wallet that signs as a different account', async ({page}) => {
  await installWallet(page);
  await page.addInitScript(() => {
    const w = (window as unknown as {__pactoraTestWallet: {wallet: {signMessage: () => Promise<unknown>}}})
      .__pactoraTestWallet;
    w.wallet.signMessage = async () => ({
      accountId: 'mallory.testnet',
      publicKey: 'ed25519:k',
      signature: 'c2ln',
    });
  });
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByRole('alert').filter({hasText: /[^ ]/})).toContainText(
    'signed as mallory.testnet, not alice.testnet',
  );
});

// ── join ───────────────────────────────────────────────────────────────────

test('join asks for a sign-in first', async ({page}) => {
  await installWallet(page);
  await page.goto('/join');
  await expect(page.getByRole('heading', {name: 'Sign in first'})).toBeVisible();
});

test('join: register_agent, then accept_wallet with the id it returned, then the person record', async ({
  page,
}) => {
  await installWallet(page);
  await signIn(page);
  await page.goto('/join');
  await expect(page.getByText(/stake of at least/)).toContainText('10 USDC');
  await page.getByLabel('Name').fill('Alice Example');
  await page.getByLabel(/I accept the Terms and Privacy policy/).check();
  const recorded = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/v1/people',
  );
  await page.getByRole('button', {name: 'Join'}).click();
  const request = await recorded;
  expect(request.headers()['authorization']).toMatch(/^Bearer ps_alice\.testnet_/);
  expect(request.postDataJSON()).toEqual({chainAgentId: '17', name: 'Alice Example'});

  await expect(page.getByRole('heading', {level: 1})).toHaveText('Welcome, Alice Example');
  await expect(page.getByRole('link', {name: 'Fund and stake'})).toHaveAttribute('href', '/agents/17/manage');

  const sent = await txs(page);
  expect(sent.map((t) => t.actions[0]!.params.methodName)).toEqual(['register_agent', 'accept_wallet']);
  expect(sent[0]!.receiverId).toBe('pactora.testnet');
  expect(sent[0]!.actions[0]!.params.args).toMatchObject({
    wallet: 'alice.testnet',
    per_task_cap: null,
    daily_cap: null,
  });
  expect(sent[0]!.actions[0]!.params.deposit).toBe('100000000000000000000000');
  expect(sent[1]!.actions[0]!.params.args).toEqual({agent_id: 17});
});

test('join: if accept_wallet fails, Retry continues from there and does not register a second agent', async ({
  page,
}) => {
  await installWallet(page);
  await signIn(page);
  await page.goto('/join');
  await page.evaluate(() => ((window as unknown as {__failNext: string}).__failNext = 'accept_wallet'));
  await page.getByLabel('Name').fill('Alice Example');
  await page.getByLabel(/I accept the Terms and Privacy policy/).check();
  await page.getByRole('button', {name: 'Join'}).click();
  await expect(page.getByRole('alert').filter({hasText: /[^ ]/})).toContainText('accept_wallet failed');
  await expect(page.getByText(/Already on chain as agent/)).toContainText('#17');
  await page.getByRole('button', {name: /Retry: accept the wallet/}).click();
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Welcome, Alice Example');
  expect(await methods(page)).toEqual(['register_agent', 'accept_wallet', 'accept_wallet']);
});

test('join: a record the API refuses (chain does not show the agent) is explained, and retry sends no transaction', async ({
  page,
}) => {
  await installWallet(page);
  await signIn(page);
  await page.goto('/join');
  // The scripted wallet's id is 17; the mock API refuses 13, so force that id.
  await page.route('**/v1/people', async (route) => {
    const body = route.request().postDataJSON();
    await route.fallback({postData: JSON.stringify({...body, chainAgentId: '13'})});
  });
  await page.getByLabel('Name').fill('Alice Example');
  await page.getByLabel(/I accept the Terms and Privacy policy/).check();
  await page.getByRole('button', {name: 'Join'}).click();
  await expect(page.getByRole('alert').filter({hasText: /[^ ]/})).toContainText('INVALID_STATE');
  await page.getByRole('button', {name: /Retry: record with Pactora/}).click();
  await expect(page.getByRole('alert').filter({hasText: /[^ ]/})).toContainText('INVALID_STATE');
  expect(await methods(page)).toEqual(['register_agent', 'accept_wallet']);
});

test('join: someone already joined is pointed at their manage page', async ({page}) => {
  await installWallet(page, 'veteran.testnet');
  await signIn(page);
  await page.goto('/join');
  await expect(page.getByRole('heading', {name: 'You have already joined'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Fund and stake'})).toHaveAttribute('href', '/agents/9/manage');
  expect(await methods(page)).toEqual([]);
});

// ── manage ─────────────────────────────────────────────────────────────────

test('manage: a visitor who is not signed in reads the numbers and gets no buttons', async ({page}) => {
  await installWallet(page);
  await mockChain(page);
  await page.goto('/agents/7/manage');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('On-chain agent 7');
  await expect(page.getByText('2.5 USDC', {exact: true})).toBeVisible();
  await expect(page.getByText(/not signed in/i)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Fund'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Set caps'})).toHaveCount(0);
});

test('manage: signed in as someone else shows no buttons either', async ({page}) => {
  await installWallet(page, 'bob.testnet');
  await mockChain(page);
  await signIn(page);
  await page.goto('/agents/7/manage');
  await expect(page.getByText(/does not own this agent/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Fund'})).toHaveCount(0);
});

test('manage: the owner funds, stakes, sets caps, withdraws and tops up storage, each as one transaction', async ({
  page,
}) => {
  await installWallet(page);
  await mockChain(page);
  await signIn(page);
  await page.goto('/agents/7/manage');

  await page.getByLabel('Amount (USDC)').nth(0).fill('1.5');
  await page.getByRole('button', {name: 'Fund', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Fund sent.'})).toBeVisible();

  await page.getByLabel('Amount (USDC)').nth(1).fill('10');
  await page.getByRole('button', {name: 'Stake', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Stake sent.'})).toBeVisible();

  await page.getByLabel(/Per task/).fill('0.2');
  await page.getByLabel(/Per day/).fill('2');
  await page.getByRole('button', {name: 'Set caps'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Set caps sent.'})).toBeVisible();

  await page.getByLabel('Amount (USDC)').nth(3).fill('0.5');
  await page.getByRole('button', {name: 'Withdraw', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Withdraw sent.'})).toBeVisible();

  await page.getByLabel('Amount (NEAR)').fill('0.1');
  await page.getByRole('button', {name: 'Deposit', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Storage deposit sent.'})).toBeVisible();

  const sent = await txs(page);
  expect(sent[3]!.actions[0]!.params).toMatchObject({
    methodName: 'withdraw',
    deposit: '1',
    args: {agent_id: 7, amount: '500000', receiver: null},
  });
  expect(sent[4]!.actions[0]!.params).toMatchObject({
    methodName: 'storage_deposit',
    deposit: '100000000000000000000000',
    args: {agent_id: 7},
  });
  const [fund, stake, caps] = sent.map((t) => ({to: t.receiverId, ...t.actions[0]!.params}));
  expect(fund).toMatchObject({
    to: 'musdc.pactora.testnet',
    methodName: 'ft_transfer_call',
    deposit: '1',
    args: {receiver_id: 'pactora.testnet', amount: '1500000', msg: '{"Fund":{"agent_id":7}}'},
  });
  expect(stake).toMatchObject({
    args: {amount: '10000000', msg: '{"Stake":{"agent_id":7}}'},
  });
  expect(caps).toMatchObject({
    to: 'pactora.testnet',
    methodName: 'set_caps',
    deposit: '1',
    args: {agent_id: 7, per_task_cap: '200000', daily_cap: '2000000'},
  });
});

test('manage: bad amounts are refused before the wallet is asked', async ({page}) => {
  await installWallet(page);
  await mockChain(page);
  await signIn(page);
  await page.goto('/agents/7/manage');
  await page.getByLabel('Amount (USDC)').nth(0).fill('1.2345678');
  await expect(page.getByText(/at most 6 decimal places/).first()).toBeVisible();
  await expect(page.getByRole('button', {name: 'Fund', exact: true})).toBeDisabled();
  await page.getByLabel(/Per task/).fill('3');
  await page.getByLabel(/Per day/).fill('2');
  await expect(page.getByText(/daily cap cannot be below/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Set caps'})).toBeDisabled();
  expect(await methods(page)).toEqual([]);
});

test('manage: a pending unstake can be cancelled, and completed once matured', async ({page}) => {
  await installWallet(page);
  await mockChain(page, {
    stake: {
      available: '2000000',
      pending: '10000000',
      unlock_at: 1,
      locked: '0',
      unlocked: '2000000',
      hireable: false,
    },
  });
  await signIn(page);
  await page.goto('/agents/7/manage');
  await expect(page.getByText(/can be withdrawn now/)).toBeVisible();
  await page.getByRole('button', {name: 'Complete unstake'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Complete unstake sent.'})).toBeVisible();
  await page.getByRole('button', {name: 'Cancel unstake'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Cancel unstake sent.'})).toBeVisible();
  expect(await methods(page)).toEqual(['complete_unstake', 'cancel_unstake']);
});

test('manage: a chain failure is shown in words', async ({page}) => {
  await installWallet(page);
  await mockChain(page);
  await signIn(page);
  await page.goto('/agents/7/manage');
  await page.evaluate(() => ((window as unknown as {__failNext: string}).__failNext = 'ft_transfer_call'));
  await page.getByLabel('Amount (USDC)').nth(0).fill('1');
  await page.getByRole('button', {name: 'Fund', exact: true}).click();
  await expect(page.getByRole('alert').filter({hasText: /[^ ]/})).toContainText('Fund failed');
});

test('manage: an id the contract does not have, and a malformed id', async ({page}) => {
  await mockChain(page);
  await page.route('https://rpc.testnet.near.org/**', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    return json(route, {
      jsonrpc: '2.0',
      id: body.id,
      result: {result: Array.from(new TextEncoder().encode('null')), logs: []},
    });
  });
  await page.goto('/agents/99/manage');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Agent not found');
  const res = await page.goto('/agents/abc/manage');
  expect(res?.status()).toBe(404);
});

// ── a11y and metadata ──────────────────────────────────────────────────────

for (const [label, setup] of [
  ['/signin signed in', async (page: Page) => signIn(page)],
  [
    '/agents/7/manage as the owner',
    async (page: Page) => {
      await mockChain(page);
      await signIn(page);
      await page.goto('/agents/7/manage');
      await expect(page.getByRole('button', {name: 'Set caps'})).toBeVisible();
    },
  ],
  [
    '/join signed in',
    async (page: Page) => {
      await signIn(page);
      await page.goto('/join');
      await expect(page.getByLabel('Name')).toBeVisible();
    },
  ],
] as const) {
  test(`accessibility: ${label}`, async ({page}) => {
    await installWallet(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await setup(page);
    await page.waitForLoadState('networkidle');
    const {violations} = await new AxeBuilder({page})
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking,
      violations.map((v) => `${v.impact} ${v.id}: ${v.nodes[0]?.target.join(' ')}`).join('\n'),
    ).toEqual([]);
  });
}

test('private pages are noindex, and the agent skill and well-known file are served', async ({
  page,
  request,
}) => {
  for (const path of ['/signin', '/agents/7/manage']) {
    await mockChain(page);
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  const skill = await request.get('/SKILL.md');
  expect(skill.ok()).toBe(true);
  expect(await skill.text()).toContain('Never report success before the job is settled');
  const wk = await request.get('/.well-known/pactora.json');
  expect(wk.ok()).toBe(true);
  const body = await wk.json();
  expect(body).toMatchObject({
    network: 'near:testnet',
    contract: null,
    token: null,
    apiBase: `http://127.0.0.1:${process.env['MOCK_API_PORT'] ?? 8787}`,
  });
});
