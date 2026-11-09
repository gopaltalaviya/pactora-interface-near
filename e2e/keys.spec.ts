import {expect, test, type Page, type Route} from '@playwright/test';
import {expectNoBlockingViolations} from './helpers';

/**
 * The owner's credential controls on /agents/[id]/manage (2026-11-09, item
 * 9 and the audit's missing features): re-issue by the owner's signature,
 * rotate and revoke by the pasted key, the agent's record, webhooks. The
 * chain is answered by page.route as in people.spec.ts. Each test failed on
 * the old build.
 */

const KEY = `ax_${'1'.repeat(16)}_${'2'.repeat(32)}`;

async function installWallet(page: Page, account = 'alice.testnet') {
  await page.addInitScript((accountId) => {
    const w = window as unknown as {__signed: unknown[]; __pactoraTestWallet: unknown};
    w.__signed = [];
    w.__pactoraTestWallet = {
      accountId,
      wallet: {
        getAccounts: async () => [{accountId}],
        signMessage: async (p: {signerId?: string; message: string}) => {
          w.__signed.push(p.message);
          return {
            accountId: p.signerId ?? accountId,
            publicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp',
            signature: 'c2ln',
          };
        },
        signAndSendTransactions: async () => [],
      },
    };
  }, account);
}

const json = (route: Route, body: unknown) =>
  route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});

async function mockChain(page: Page) {
  const answers: Record<string, unknown> = {
    get_agent: {
      id: 7,
      owner: 'alice.testnet',
      wallet: 'alice.testnet',
      pending_wallet: null,
      card_uri: 'data:,',
      frozen: false,
      registered_at: 1,
    },
    purse_of: {
      balance: '2500000',
      per_task_cap: '100000',
      daily_cap: '1000000',
      spent_today: '20000',
      daily_remaining: '980000',
      next_release_at: 0,
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

async function asOwner(page: Page) {
  await installWallet(page);
  await mockChain(page);
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toBeVisible();
  await page.goto('/agents/7/manage');
  await expect(page.getByRole('heading', {name: 'Credentials and record'})).toBeVisible();
}

test('re-issue: the owner signs the challenge (no transaction) and the new key is shown once', async ({
  page,
}) => {
  await asOwner(page);
  const card = page.getByRole('region', {name: 'Re-issue the API key'});
  await card.getByLabel('Pactora agent id').fill('7');
  await card.getByRole('button', {name: 'Re-issue the key'}).click();
  await expect(card).toContainText('Every current key stops working');
  await card.getByRole('button', {name: 'Sign and re-issue'}).click();
  await expect(card.getByTestId('reissue-new-key')).toContainText(/^Copy the new key now/);
  await expect(card.getByTestId('reissue-new-key')).toContainText(/ax_k\d+/);
  const signed = await page.evaluate(() => (window as unknown as {__signed: string[]}).__signed);
  expect(signed).toHaveLength(1);
  expect(signed[0]).toMatch(/re-issue the key of agent 7/);
});

test('rotate asks for the current key and a confirmation, then shows the new one; revoke is the kill switch', async ({
  page,
}) => {
  await asOwner(page);
  const card = page.getByRole('region', {name: 'Rotate or revoke a key'});
  await card.getByRole('button', {name: 'Rotate'}).click();
  await card.getByRole('button', {name: 'Confirm: rotate'}).click();
  await expect(card.getByText('Paste the agent’s current API key.')).toBeVisible();
  await card.getByLabel('Current API key').fill(KEY);
  await card.getByLabel(/Scopes of the new key/).selectOption('worker');
  await card.getByRole('button', {name: 'Confirm: rotate'}).click();
  await expect(card.getByTestId('rotate-new-key')).toContainText(/ax_k\d+/);
  await expect(card.getByTestId('rotate-new-key')).toContainText('Scopes: worker');

  await card.getByLabel('Current API key').fill(KEY);
  await card.getByRole('button', {name: 'Revoke'}).click();
  await card.getByRole('button', {name: 'Confirm: revoke'}).click();
  await expect(card.getByTestId('key-revoked')).toContainText('is revoked');
});

test('the agent’s record is edited with its key; nothing changed is refused before the API', async ({
  page,
}) => {
  await asOwner(page);
  const card = page.getByRole('region', {name: 'Edit the agent’s record'});
  await card.getByLabel('Agent API key').fill(KEY);
  await card.getByRole('button', {name: 'Save the record'}).click();
  await expect(card.getByText('Change at least one field.')).toBeVisible();
  await card.getByLabel('Name').fill('Renamed Bot');
  await card.getByLabel('Accepting work').selectOption('no');
  await card.getByRole('button', {name: 'Save the record'}).click();
  await expect(card.getByTestId('agent-saved')).toContainText('Renamed Bot');
  await expect(card.getByTestId('agent-saved')).toContainText('not accepting work');
});

test('webhooks: list, add (secret once), deliveries, rotate the secret, delete with a confirmation', async ({
  page,
}) => {
  await asOwner(page);
  const card = page.getByRole('region', {name: 'Webhooks'});
  await card.getByLabel('Agent API key').fill(KEY);
  await card.getByRole('button', {name: 'Show webhooks'}).click();
  await expect(card.getByTestId('no-webhooks')).toBeVisible();
  await card.getByLabel('Add a webhook (https URL)').fill('https://example.com/pactora');
  await card.getByRole('button', {name: 'Add', exact: true}).click();
  const hook = card.getByTestId('webhook');
  await expect(hook).toHaveCount(1);
  await expect(card.getByTestId('webhook-secret')).toContainText('whsec_');
  await hook.getByRole('button', {name: 'Deliveries'}).click();
  await expect(hook.getByRole('list', {name: 'Deliveries'})).toContainText('job.settled');
  await hook.getByRole('button', {name: 'Rotate the secret'}).click();
  await expect(card.getByTestId('webhook-secret')).toContainText('6'.repeat(32));
  await hook.getByRole('button', {name: 'Delete'}).click();
  await hook.getByRole('button', {name: 'Confirm: delete'}).click();
  await expect(card.getByTestId('webhook')).toHaveCount(0);
});

test('the credentials cards pass an accessibility scan', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await asOwner(page);
  await expectNoBlockingViolations(page, 'manage credentials');
});
