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
  await page.waitForLoadState('networkidle');
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
  await card.getByLabel('Pactora agent id').fill('7');
  await card.getByLabel('Name').fill('Renamed Bot');
  await card.getByLabel('Accepting work').selectOption('no');
  const sent = page.waitForRequest((r) => r.method() === 'PATCH' && /\/v1\/agents\/7$/.test(r.url()));
  await card.getByRole('button', {name: 'Save the record'}).click();
  expect((await sent).postDataJSON()).toMatchObject({name: 'Renamed Bot', active: false});
  await expect(card.getByTestId('agent-saved')).toContainText('Now named Renamed Bot');
  await expect(card.getByTestId('agent-saved')).toContainText('not accepting work');
});

test('rename: a reply without a name (an API before 2026-11-10) never reads "undefined"', async ({page}) => {
  await asOwner(page);
  await page.route('**/v1/agents/7', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({agentId: 7, pricePerTask: '30000', active: true}),
        })
      : route.fallback(),
  );
  const card = page.getByRole('region', {name: 'Edit the agent’s record'});
  await card.getByLabel('Agent API key').fill(KEY);
  await card.getByLabel('Pactora agent id').fill('7');
  await card.getByLabel('Name').fill('Quiet Bot');
  await card.getByRole('button', {name: 'Save the record'}).click();
  const saved = card.getByTestId('agent-saved');
  await expect(saved).toBeVisible();
  await expect(saved).not.toContainText('undefined');
  await expect(saved).toContainText('the API did not confirm the name');
});

test('webhooks: list, add (secret once), deliveries, rotate the secret, delete with a confirmation', async ({
  page,
}, info) => {
  await asOwner(page);
  // The mock keeps webhooks per key, and the browsers run at once: each run gets a key of its own.
  const hookKey = `ax_${info.project.name.replace(/[^a-z0-9]/gi, '')}${Date.now()}_${'2'.repeat(32)}`;
  const card = page.getByRole('region', {name: 'Webhooks'});
  await card.getByLabel('Agent API key').fill(hookKey);
  await card.getByRole('button', {name: 'Show webhooks'}).click();
  await expect(card.getByTestId('no-webhooks')).toBeVisible();
  await card.getByLabel('Add a webhook (https URL)').fill('https://example.com/pactora');
  await card.getByLabel(/Event kinds/).fill('job.settled, job.message');
  const sent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/v1/webhooks'));
  await card.getByRole('button', {name: 'Add', exact: true}).click();
  // The API's field is `kinds` (routes/webhooks.ts); `events` is refused.
  expect((await sent).postDataJSON()).toEqual({
    url: 'https://example.com/pactora',
    kinds: ['job.settled', 'job.message'],
  });
  const hook = card.getByTestId('webhook');
  await expect(hook).toHaveCount(1);
  await expect(hook).toContainText('job.settled, job.message');
  await expect(card.getByTestId('webhook-secret')).toContainText('whsec_');
  // The list, re-read from the API, renders its shape (it crashed on `events` before).
  await card.getByRole('button', {name: 'Show webhooks'}).click();
  await expect(hook).toHaveCount(1);
  await hook.getByRole('button', {name: 'Deliveries'}).click();
  const rows = hook.getByRole('list', {name: 'Deliveries'});
  await expect(rows).toContainText('#2 · pending · 2 attempts · last answer 503 · HTTP 503 · next attempt');
  await expect(rows).toContainText('#1 · delivered · 1 attempt · last answer 200 · delivered');
  await expect(rows).not.toContainText('undefined');
  await hook.getByRole('button', {name: 'Rotate the secret'}).click();
  await expect(card.getByTestId('webhook-secret')).toContainText('6'.repeat(32));
  await hook.getByRole('button', {name: 'Delete'}).click();
  // By keyboard: headless WebKit under parallel load can starve requestAnimationFrame for this
  // late step (seen 2026-11-10: 1-2 frames a second), and a pointer click waits on frames for
  // "stable"; a key press does not, and it is the keyboard user's path anyway.
  await hook.getByRole('button', {name: 'Confirm: delete'}).press('Enter');
  await expect(card.getByTestId('webhook')).toHaveCount(0);
});

test('the credentials cards pass an accessibility scan', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await asOwner(page);
  await expectNoBlockingViolations(page, 'manage credentials');
});
