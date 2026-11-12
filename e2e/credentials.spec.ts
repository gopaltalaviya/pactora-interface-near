import {expect, test, type Page} from '@playwright/test';
import {
  chainCredentials,
  credentialToken,
  CREDENTIALS,
  MOCK_API,
  quietChain,
  signInAs,
  withCredentials,
} from './helpers';

/**
 * Work credentials (feature/work-credentials): a soulbound NFT the worker of a
 * settled job claims, and the list of them on agent and profile pages, read
 * straight from the chain. The mock's network has no credentials contract, so
 * every page must look as before; `withCredentials` adds it for one page.
 *
 * JOB(1) is settled (olive the client, wade the worker); JOB(4) is accepted.
 * Claims are made on clones, so parallel browsers never share one.
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PRIYA = 'dddddddd-0000-4000-8000-000000000001';

async function freshJob(page: Page, template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/job/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

test.beforeEach(async ({page}) => quietChain(page));

test('the worker of a settled job claims its credential from the keyboard, and it stays claimed', async ({
  page,
}) => {
  const id = await freshJob(page, JOB(1));
  await withCredentials(page);
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Work credential'});
  await expect(card).toContainText('non-transferable NFT on NEAR');
  await expect(card).toContainText('costs you nothing');
  const claim = card.getByRole('button', {name: 'Claim your work credential'});
  await claim.focus();
  await page.keyboard.press('Enter');
  const minted = card.getByTestId('credential-minted');
  await expect(minted).toContainText('Credential #5000');
  await expect(minted).toContainText(CREDENTIALS);
  await expect(minted).toContainText('NEAR wallet');
  await expect(card.getByRole('link', {name: /issuing transaction/})).toHaveAttribute(
    'href',
    /^https:\/\/testnet\.nearblocks\.io\/txns\/MINT\d+$/,
  );
  await page.reload();
  await expect(
    page.getByRole('region', {name: 'Work credential'}).getByTestId('credential-minted'),
  ).toContainText('Credential #5000');
  await expect(page.getByRole('button', {name: 'Claim your work credential'})).toHaveCount(0);
});

test('a server that cannot issue credentials says why, and that the job and payment are unaffected', async ({
  page,
}) => {
  const id = await freshJob(page, JOB(1));
  expect((await page.request.post(`${MOCK_API}/__test/job/${id}/credential/unavailable`)).ok()).toBe(true);
  await withCredentials(page);
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Work credential'});
  await card.getByRole('button', {name: 'Claim your work credential'}).click();
  const box = card.getByTestId('credential-unavailable');
  await expect(box).toContainText('cannot issue work credentials right now');
  await expect(box).toContainText('no credentials minter is configured on this network');
  await expect(box).toContainText('Your job and your payment are not affected');
});

test('the client, a stranger, a visitor and the worker of an unsettled job see no credential card', async ({
  page,
}) => {
  const id = await freshJob(page, JOB(1));
  await withCredentials(page);
  await page.goto(`/jobs/${id}`);
  await expect(page.getByTestId('state-plain')).toBeVisible();
  await expect(page.getByRole('region', {name: 'Work credential'})).toHaveCount(0);

  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${id}`);
  await expect(page.getByRole('region', {name: 'Review the worker'})).toBeVisible();
  await expect(page.getByRole('region', {name: 'Work credential'})).toHaveCount(0);

  const other = await page.context().browser()!.newPage();
  await quietChain(other);
  await withCredentials(other);
  await signInAs(other, 'nora.testnet');
  await other.goto(`/jobs/${id}`);
  await expect(other.getByTestId('not-a-party')).toBeVisible();
  await expect(other.getByRole('region', {name: 'Work credential'})).toHaveCount(0);
  await other.close();

  const worker = await page.context().browser()!.newPage();
  await quietChain(worker);
  await withCredentials(worker);
  await signInAs(worker, 'wade.testnet');
  await worker.goto(`/jobs/${JOB(4)}`);
  await expect(worker.getByText('You are the worker', {exact: true})).toBeVisible();
  await expect(worker.getByRole('region', {name: 'Work credential'})).toHaveCount(0);
  await worker.close();
});

test('a network with no credentials contract shows no card and no list, and asks the chain for none', async ({
  page,
}) => {
  const seen = await chainCredentials(page, {});
  const id = await freshJob(page, JOB(1));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  await expect(page.getByRole('region', {name: 'Review the client'})).toBeVisible();
  await expect(page.getByRole('region', {name: 'Work credential'})).toHaveCount(0);

  await page.goto('/agents/1');
  await expect(page.getByTestId('agent-stake')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', {name: 'Work credentials'})).toHaveCount(0);
  await page.goto(`/people/${PRIYA}`);
  await expect(page.getByTestId('profile-rating')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', {name: 'Work credentials'})).toHaveCount(0);
  expect(seen).toEqual([]);
});

test('an agent page lists its credentials, read from the chain, each linked to its job', async ({page}) => {
  await withCredentials(page);
  const seen = await chainCredentials(page, {
    'researchbot.owner.testnet': [
      credentialToken('researchbot.owner.testnet', '5000', '20000', '2026-11-10T09:00:00.000Z'),
      credentialToken('researchbot.owner.testnet', '68', '4000000', '2026-11-12T09:30:00.000Z'),
    ],
  });
  await page.goto('/agents/1');
  const list = page.getByRole('region', {name: 'Work credentials'});
  await expect(list.getByTestId('credentials-count')).toHaveText('2');
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Pactora job #5000');
  await expect(items.nth(0)).toContainText('0.02 USDC');
  await expect(items.nth(0)).toContainText('10 Nov 2026');
  await expect(items.nth(0).getByRole('link', {name: /job #5000/})).toHaveAttribute(
    'href',
    `/jobs/${JOB(1)}`,
  );
  await expect(items.nth(1)).toContainText('4 USDC');
  await expect(
    items.nth(1).getByRole('link', {name: /credential #68 on the block explorer/}),
  ).toHaveAttribute('href', `https://testnet.nearblocks.io/nft-token/${CREDENTIALS}/68`);
  await expect(list.getByTestId('credentials-verify')).toContainText('Verify on chain');
  expect(seen).toContain(`${CREDENTIALS}:researchbot.owner.testnet`);
});

test('a failed chain read says so and reads again; an agent with none says how they are earned', async ({
  page,
}) => {
  await withCredentials(page);
  await chainCredentials(page, {}, {fail: true});
  await page.goto('/agents/1');
  const list = page.getByRole('region', {name: 'Work credentials'});
  await expect(list.getByRole('alert')).toContainText('Could not read credentials from the chain');
  await page.unroute('https://rpc.testnet.near.org/**');
  await quietChain(page);
  await chainCredentials(page, {});
  await list.getByRole('button', {name: 'Read again'}).click();
  await expect(list.getByTestId('credentials-empty')).toHaveText(
    'No credentials yet — they are issued when a job settles and its worker claims it.',
  );
});

test('a person profile lists the credentials of the account it shows', async ({page}) => {
  await withCredentials(page);
  await chainCredentials(page, {
    'priya.testnet': [credentialToken('priya.testnet', '77', '1500000', '2026-11-11T12:00:00.000Z')],
  });
  await page.goto(`/people/${PRIYA}`);
  const list = page.getByRole('region', {name: 'Work credentials'});
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Pactora job #77');
  await expect(list).toContainText('1.5 USDC');
  await expect(list.getByTestId('credentials-verify')).toContainText('priya.testnet');
});
