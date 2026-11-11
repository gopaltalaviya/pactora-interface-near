import {expect, test} from '@playwright/test';
import {MOCK_API} from './helpers';

/**
 * 2026-11-11: /receipts, the public list of agent-to-agent jobs settled on
 * chain, and the Receipt card on a job page. A visitor with no key reaches
 * them from the home page and from /demo.
 */

const JOB1 = 'aaaaaaaa-0000-4000-8000-000000000001';

test('receipts: lists a settled job with its parties, hashes, transactions and explorer link', async ({
  page,
}) => {
  await page.goto('/receipts');
  await expect(page.getByRole('heading', {level: 1, name: 'Receipts'})).toBeVisible();
  const item = page.getByTestId('receipt');
  await expect(item).toHaveCount(1);
  await expect(page.getByTestId('receipts-count')).toHaveText('1 settled job, newest first');
  await expect(item.getByRole('link', {name: 'Depth of NEAR/USDC'})).toHaveAttribute('href', `/jobs/${JOB1}`);
  await expect(item.getByRole('link', {name: 'Orchestrator'})).toHaveAttribute('href', '/agents/1');
  await expect(item.getByRole('link', {name: 'MarketResearch'})).toHaveAttribute('href', '/agents/2');
  await expect(item).toContainText('0.02 USDC');
  await expect(item).toContainText('on chain as job 5000');
  await expect(item).toContainText('4 transactions');
  await expect(item.getByTestId('receipt-judged')).toHaveText('Judged on NEAR AI');
  await expect(item).toContainText(`spec ${'ab'.repeat(5)}…`);
  const explorer = item.getByRole('link', {name: /settlement on the explorer/});
  await expect(explorer).toHaveAttribute('href', 'https://testnet.nearblocks.io/txns/SETTLE1');
  await expect(explorer).toHaveAttribute('rel', /noopener/);
});

test('receipts: an empty list says so and points to the demo', async ({page}) => {
  await page.route(`${MOCK_API}/v1/receipts*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({count: 0, receipts: []}),
    }),
  );
  await page.goto('/receipts');
  await expect(page.getByText('No settled agent jobs yet')).toBeVisible();
  await expect(page.getByRole('link', {name: 'See how a run works'})).toHaveAttribute('href', '/demo');
});

test('receipts: an API failure is an error, not an empty list', async ({page}) => {
  await page.route(`${MOCK_API}/v1/receipts*`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({code: 'INTERNAL', detail: 'boom'}),
    }),
  );
  await page.goto('/receipts');
  await expect(page.getByText('Could not load the receipts')).toBeVisible();
  await expect(page.getByText('No settled agent jobs yet')).toHaveCount(0);
});

test('receipts: reached from the home page and from /demo without a key', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('link', {name: 'See settled receipts'})).toHaveAttribute('href', '/receipts');
  await page.goto('/demo');
  await expect(
    page.getByTestId('demo-receipts-link').getByRole('link', {name: /already settled/}),
  ).toHaveAttribute('href', '/receipts');
});

test('job page: the Receipt card shows both hashes, the transaction count and the read-only CLI call', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB1}`);
  const card = page.getByTestId('job-receipt');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('receipt-spec-hash')).toHaveText('0x' + 'ab'.repeat(32));
  await expect(page.getByTestId('receipt-result-hash')).toHaveText('0x' + 'cd'.repeat(32));
  await expect(page.getByTestId('receipt-tx-count')).toContainText('each linked in the timeline below');
  await expect(page.getByTestId('receipt-cli')).toHaveText(
    `near contract call-function as-read-only pactora.testnet get_job json-args '{"job_id": 5000}' network-config testnet now`,
  );
});
