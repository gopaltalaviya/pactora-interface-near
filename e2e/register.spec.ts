import {expect, test, type Page} from '@playwright/test';

/**
 * /register after the live audit of 2026-11-09: a rate-limited record is not
 * a dead end (a countdown from retryAfter, then the record is retried
 * without signing again), and the done page says the agent is not hireable
 * until it is staked, with a link to its manage page.
 */

async function wallet(page: Page, account = 'olive.testnet') {
  await page.addInitScript((accountId) => {
    const w = window as unknown as {__txs: unknown[]; __pactoraTestWallet: unknown};
    w.__txs = [];
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
        signAndSendTransactions: async (p: {transactions: {actions: {params?: {methodName?: string}}[]}[]}) =>
          p.transactions.map((tx) => {
            w.__txs.push(tx);
            const method = tx.actions.find((a) => a.params?.methodName)?.params?.methodName;
            return {
              status: {SuccessValue: btoa(method === 'register_agent' ? '17' : '')},
              transaction: {hash: `TXHASH${++hash}`},
            };
          }),
      },
    };
  }, account);
}

const txCount = (page: Page) => page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs.length);

async function fill(page: Page) {
  await page.goto('/register');
  await page
    .getByRole('button', {name: /Connect/})
    .first()
    .click();
  await page.getByLabel('Name').fill('Rate Bot');
}

test('a rate-limited record shows a plain sentence and a countdown, then retries without signing again', async ({
  page,
}) => {
  await wallet(page);
  let posts = 0;
  await page.route(
    (url) => url.pathname === '/v1/agents',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      if (posts === 1) {
        return route.fulfill({
          status: 429,
          contentType: 'application/problem+json',
          headers: {'access-control-allow-origin': '*', 'retry-after': '1'},
          body: JSON.stringify({
            code: 'RATE_LIMITED',
            detail: 'Rate limit exceeded, retry in 1 seconds',
            retryAfter: 1,
          }),
        });
      }
      return route.continue();
    },
  );
  await fill(page);
  await page.getByRole('button', {name: 'Register', exact: true}).click();
  const notice = page.getByTestId('register-wait');
  await expect(notice).toContainText(/Too many requests/i);
  await expect(notice).toContainText(/\d+ s/);
  await expect(page.getByText(/RATE_LIMITED/)).toHaveCount(0);
  await expect(page.getByRole('heading', {name: /registered/})).toBeVisible({timeout: 15_000});
  expect(posts).toBe(2);
  // The chain was asked once: the retry was the record only.
  expect(await txCount(page)).toBe(2);
});

test('the done page does not claim the agent is hireable, and links to its manage page', async ({page}) => {
  await wallet(page);
  await fill(page);
  await page.getByRole('button', {name: 'Register', exact: true}).click();
  await expect(page.getByRole('heading', {name: /registered/})).toBeVisible();
  await expect(page.getByText('Hireable now')).toHaveCount(0);
  await expect(page.getByRole('heading', {name: /not hireable until/i})).toBeVisible();
  await expect(page.getByRole('link', {name: /Fund and stake/})).toHaveAttribute('href', '/agents/17/manage');
});
