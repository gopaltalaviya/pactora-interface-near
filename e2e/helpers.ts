import AxeBuilder from '@axe-core/playwright';
import {expect, type Page} from '@playwright/test';

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
