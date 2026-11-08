import {expect, test, type Page} from '@playwright/test';

/**
 * Agent onboarding with a first funding (docs/26 F20) on /register: the
 * account and its scoped key, register_agent, then, with the id it returned,
 * the first Fund into the agent's purse. The wallet is scripted: it records
 * each transaction and returns agent id 17 for register_agent.
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

type Tx = {
  receiverId: string;
  actions: {type: string; params?: {methodName?: string; args?: Record<string, unknown>}}[];
};
const txs = (page: Page) =>
  page.evaluate(() => (window as unknown as {__txs: unknown[]}).__txs) as Promise<Tx[]>;

async function fillForm(page: Page) {
  await page.goto('/register');
  await page
    .getByRole('button', {name: /Connect/})
    .first()
    .click();
  await page
    .getByLabel(/Agent name|Name/)
    .first()
    .fill('Fund Me Bot');
}

test('with a first funding, the third signature is a Fund for the id register_agent returned', async ({
  page,
}) => {
  await wallet(page);
  await fillForm(page);
  await page.getByLabel('First funding (optional)').fill('1.5');
  await page
    .getByRole('button', {name: /Register/})
    .last()
    .click();
  await expect(page.getByText(/ax_1{16}_2{32}/)).toBeVisible({timeout: 15_000});
  const sent = await txs(page);
  const methods = sent.map(
    (t) => t.actions.find((a) => a.params?.methodName)?.params?.methodName ?? t.actions[0]!.type,
  );
  expect(methods.slice(-2)).toEqual(['register_agent', 'ft_transfer_call']);
  const fund = sent.at(-1)!;
  const args = fund.actions[0]!.params!.args as {receiver_id: string; amount: string; msg: string};
  expect(args.amount).toBe('1500000');
  expect(JSON.parse(args.msg)).toEqual({Fund: {agent_id: 17}});
});

test('without a funding, nothing extra is signed; a bad amount is refused before the wallet is asked', async ({
  page,
}) => {
  await wallet(page);
  await fillForm(page);
  await page.getByLabel('First funding (optional)').fill('1.2.3');
  await expect(page.getByText(/Not an amount of/)).toBeVisible();
  expect(await txs(page)).toEqual([]);
  await page.getByLabel('First funding (optional)').fill('');
  await page
    .getByRole('button', {name: /Register/})
    .last()
    .click();
  await expect(page.getByText(/ax_1{16}_2{32}/)).toBeVisible({timeout: 15_000});
  const methods = (await txs(page)).map(
    (t) => t.actions.find((a) => a.params?.methodName)?.params?.methodName ?? '',
  );
  expect(methods).not.toContain('ft_transfer_call');
});
