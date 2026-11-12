import AxeBuilder from '@axe-core/playwright';
import {expect, type Page, type Route} from '@playwright/test';

/**
 * Shared by the job-board specs: a scripted wallet, signing in as one of the
 * accounts the mock API knows, and an axe scan. (people.spec.ts keeps its own
 * copy of the wallet; it predates this file and needs no change.)
 *
 * The wallet is honoured only by a build made with NEXT_PUBLIC_E2E_WALLET=1.
 * It records every transaction it is asked to sign in `window.__txs`, so a
 * test asserts on exactly what a person's wallet would have been shown.
 */

export type Tx = {
  receiverId: string;
  actions: {params: {methodName: string; args: Record<string, unknown>; deposit: string}}[];
};

export const MOCK_API = `http://127.0.0.1:${process.env['MOCK_API_PORT'] ?? 8787}`;

export async function installWallet(page: Page, account: string) {
  await page.addInitScript((accountId) => {
    const w = window as unknown as {__txs: unknown[]; __signerSeen: unknown[]; __pactoraTestWallet: unknown};
    w.__txs = [];
    w.__signerSeen = [];
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
        signAndSendTransactions: async (p: {signerId?: string; transactions: unknown[]}) => {
          w.__signerSeen.push(p.signerId);
          return p.transactions.map((tx) => {
            w.__txs.push(tx);
            return {status: {SuccessValue: ''}, transaction: {hash: `TXHASH${accountId}${++hash}`}};
          });
        },
      },
    };
  }, account);
}

export const txs = (page: Page) =>
  page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs) as Promise<Tx[]>;
export const methods = async (page: Page) => (await txs(page)).map((t) => t.actions[0]!.params.methodName);
export const signers = (page: Page) =>
  page.evaluate(() => (window as unknown as {__signerSeen: unknown[]}).__signerSeen) as Promise<string[]>;

/** A new tab, signed in as `account` (which must be one the mock knows, or a stranger to it). */
export async function signInAs(page: Page, account: string) {
  await installWallet(page, account);
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toHaveText(account);
}

export async function expectNoBlockingViolations(page: Page, label: string) {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.waitForLoadState('networkidle');
  const {violations} = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = violations.map(
    (v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`,
  );
  if (summary.length) console.warn(`${label}\n  ${summary.join('\n  ')}`);
  expect(blocking, summary.join('\n')).toEqual([]);
}

/**
 * A NEAR node that knows nothing (2026-11-12): every view answers `null`, so
 * a page that reads the chain (the money panel, an agent's stake) never
 * reaches the real public nodes from a test, whose CORS and rate limits are
 * not this site's. A test that needs answers routes its own after this one
 * (the last route registered wins).
 */
export async function quietChain(page: Page) {
  const nothing = (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {id?: unknown};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id ?? 'x',
        result: {result: [110, 117, 108, 108], logs: []},
      }),
    });
  };
  await page.route('https://rpc.testnet.near.org/**', nothing);
  await page.route('https://test.rpc.fastnear.com/**', nothing);
}

/** The work-credentials contract e2e/credentials.spec.ts adds to the mock network (mock-api.mjs CREDENTIALS). */
export const CREDENTIALS = 'credentials.pactora.testnet';

/** GET /v1/network, as a network with the credentials contract deployed answers it. */
export async function withCredentials(page: Page) {
  await page.route(`${MOCK_API}/v1/network`, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as {contracts: Record<string, string>};
    body.contracts['Credentials'] = CREDENTIALS;
    await route.fulfill({response: res, json: body});
  });
}

export const credentialToken = (owner: string, chainJobId: string, amount: string, settledAt: string) => ({
  token_id: chainJobId,
  owner_id: owner,
  metadata: {
    title: `Pactora job #${chainJobId}`,
    description: 'A paid job on Pactora, settled on chain.',
    media: null,
    issued_at: String(Date.parse(settledAt)),
    extra: JSON.stringify({
      contract: 'pactora.testnet',
      chainJobId,
      client: 'olive.testnet',
      worker: owner,
      amount,
      token: 'musdc.pactora.testnet',
      specHash: 'ab'.repeat(32),
      resultHash: 'cd'.repeat(32),
      reviewHash: null,
      settledAt,
    }),
  },
});

/**
 * The node answers `nft_tokens_for_owner` on the credentials contract from
 * `byOwner` (or fails, with `fail`); every other view falls through to
 * quietChain's `null`. Registered after quietChain, so it is asked first.
 */
export async function chainCredentials(
  page: Page,
  byOwner: Record<string, unknown[]>,
  {fail = false}: {fail?: boolean} = {},
) {
  const seen: string[] = [];
  const handler = async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      id?: unknown;
      params?: {account_id?: string; method_name?: string; args_base64?: string};
    };
    if (body.params?.method_name !== 'nft_tokens_for_owner') return route.fallback();
    const args = JSON.parse(Buffer.from(body.params.args_base64 ?? '', 'base64').toString()) as {
      account_id: string;
    };
    seen.push(`${body.params.account_id}:${args.account_id}`);
    if (fail) return route.fulfill({status: 502, contentType: 'text/plain', body: 'bad gateway'});
    const value = byOwner[args.account_id] ?? [];
    return route.fulfill({
      contentType: 'application/json',
      json: {jsonrpc: '2.0', id: body.id ?? 'x', result: {result: [...Buffer.from(JSON.stringify(value))]}},
    });
  };
  await page.route('https://rpc.testnet.near.org/**', handler);
  return seen;
}
