import {expect, test, type Page} from '@playwright/test';
import {expectNoBlockingViolations, methods, MOCK_API, signInAs, txs} from './helpers';

/**
 * A listing job's delivery in a real browser (docs/26 F6–F8): the worker's
 * photos, chat and draft rounds; the client's review with a check per
 * criterion; then the accepted draft submitted and approved through the
 * wallet. The API is the mock (olive is the client, wade the worker, nora a
 * bystander); each test that changes something works on a clone.
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fresh(page: Page, template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/job/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

/** A real 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const photos = (page: Page) => page.getByRole('list', {name: 'Photos'}).getByRole('listitem');

test('worker: uploads a photo, chats, posts a draft; submitting waits for the review', async ({page}) => {
  const id = await fresh(page, JOB(40));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);

  await expect(page.getByTestId('draft-phase')).toContainText('No draft yet');
  // Nothing to submit before a draft is accepted, and no free-form result box.
  await expect(page.getByRole('button', {name: /submit/i})).toHaveCount(0);

  await page.getByLabel('Add a photo').setInputFiles({name: 'front.png', mimeType: 'image/png', buffer: PNG});
  await expect(photos(page)).toHaveCount(1);
  await expect(page.getByTestId('photo-verified')).toBeVisible();
  await expect(page.getByRole('img', {name: /^Evidence /})).toBeVisible();

  await page.getByLabel('Your message').fill('Both fronts are done, uploading now.');
  await page.getByRole('button', {name: 'Send'}).click();
  await expect(page.getByRole('list', {name: 'Messages'})).toContainText('Both fronts are done');
  await expect(page.getByLabel('Your message')).toHaveValue('');

  await page.getByLabel('Draft 1: what you did').fill('short');
  await page.getByRole('button', {name: 'Post draft 1'}).click();
  await expect(page.getByRole('alert').filter({hasText: '10-10000'})).toBeVisible();

  await page
    .getByLabel('Draft 1: what you did')
    .fill('Both shop fronts photographed in daylight, signs readable.');
  await page.getByRole('button', {name: 'Post draft 1'}).click();
  await expect(page.getByTestId('draft-phase')).toContainText('waiting for the client');
  const round = page.getByTestId('draft-1');
  await expect(round).toContainText('1 photo · 1 message');
  await expect(round).toContainText('Awaiting review');
  // The form closes: the next round opens only after a revise.
  await expect(page.getByLabel(/Draft 2/)).toHaveCount(0);
  expect(await txs(page)).toEqual([]);
});

test('worker: a photo of the wrong type is refused in the page, before any upload', async ({page}) => {
  const id = await fresh(page, JOB(40));
  await signInAs(page, 'wade.testnet');
  let uploads = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/files')) uploads++;
  });
  await page.goto(`/jobs/${id}`);
  await page
    .getByLabel('Add a photo')
    .setInputFiles({name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a')});
  await expect(page.getByRole('alert').filter({hasText: 'PNG, JPEG or WebP'})).toBeVisible();
  await expect(page.getByText('No photos yet.')).toBeVisible();
  expect(uploads).toBe(0);
});

test('worker: withdrawing a photo keeps it listed as withdrawn', async ({page}) => {
  const id = await fresh(page, JOB(40));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  await page.getByLabel('Add a photo').setInputFiles({name: 'a.png', mimeType: 'image/png', buffer: PNG});
  await expect(photos(page)).toHaveCount(1);
  await photos(page).getByRole('button', {name: 'Withdraw', exact: true}).click();
  await photos(page).getByRole('button', {name: 'Confirm withdrawal'}).click();
  await expect(photos(page).first()).toContainText('withdrawn');
  await expect(photos(page).getByRole('button', {name: 'Withdraw'})).toHaveCount(0);
});

test('client: reviews with a check per criterion; accepting needs every one met', async ({page}) => {
  const id = await fresh(page, JOB(42));
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${id}`);

  await expect(page.getByTestId('draft-phase')).toContainText('waiting for the client');
  await expect(page.getByTestId('draft-1')).toContainText('Both shop fronts photographed');
  await expect(page.getByTestId('photo-verified')).toBeVisible();
  await expect(page.getByRole('list', {name: 'Messages'})).toContainText('On my way');
  // The client reviews; it does not upload or post drafts.
  await expect(page.getByLabel('Add a photo')).toHaveCount(0);

  const review = page.getByRole('form', {name: 'Review of draft 1'});
  // One check per line of the listing's criteria, list markers dropped.
  await expect(review.getByRole('checkbox')).toHaveCount(2);
  await expect(review.getByText('Both shop fronts are shown', {exact: true})).toBeVisible();
  await expect(review.getByText('Each sign is readable', {exact: true})).toBeVisible();
  const accept = review.getByRole('button', {name: 'Accept this draft'});
  await expect(accept).toBeDisabled();
  await review.getByRole('checkbox').first().check();
  await expect(accept).toBeDisabled();
  await review.getByRole('checkbox').nth(1).check();
  await expect(accept).toBeEnabled();

  await review.getByLabel('Your reason').fill('ok');
  await accept.click();
  await expect(review.getByRole('alert').filter({hasText: '10-2000'})).toBeVisible();
  await review.getByLabel('Your reason').fill('Both fronts shown, both signs readable.');
  await accept.click();

  await expect(page.getByTestId('draft-phase')).toContainText('accepted a draft');
  await expect(page.getByTestId('draft-1')).toContainText('Accepted');
  await expect(page.getByTestId('accepted-hash')).toHaveText(/^[0-9a-f]{64}$/);
  // Approving waits until the chain holds the accepted hash.
  await expect(page.getByRole('button', {name: 'Approve and pay'})).toHaveCount(0);
});

test('client: a revision opens the next round for the worker', async ({page, browser}) => {
  const id = await fresh(page, JOB(42));
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${id}`);
  const review = page.getByRole('form', {name: 'Review of draft 1'});
  await review.getByLabel('What shows it (check 2)').fill('The second sign is blurred.');
  await review.getByLabel('Your reason').fill('The second sign cannot be read. Please retake it.');
  await review.getByRole('button', {name: 'Ask for a revision (3 left)'}).click();
  await review.getByRole('button', {name: 'Confirm revision'}).click();
  await expect(page.getByTestId('draft-phase')).toContainText('asked for a revision');
  await expect(page.getByTestId('draft-1')).toContainText('Revision asked');
  await expect(page.getByTestId('draft-1')).toContainText('The second sign is blurred.');

  const worker = await browser.newPage();
  await signInAs(worker, 'wade.testnet');
  await worker.goto(`/jobs/${id}`);
  await worker.getByLabel('Draft 2: what you did').fill('Retook the second sign; both readable now.');
  await worker.getByRole('button', {name: 'Post draft 2'}).click();
  await expect(worker.getByTestId('draft-2')).toContainText('Awaiting review');
  await worker.close();

  // The client's page follows the live stream: round 2 arrives without a reload.
  await expect(page.getByRole('form', {name: 'Review of draft 2'})).toBeVisible({timeout: 15_000});
  await expect(page.getByRole('button', {name: 'Ask for a revision (2 left)'})).toBeVisible();
});

test('worker submits the accepted draft through the wallet; the client then approves', async ({
  page,
  browser,
}) => {
  const id = await fresh(page, JOB(43));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  await expect(page.getByTestId('draft-phase')).toContainText('accepted a draft');
  await expect(page.getByLabel('Result (a JSON object)')).toHaveCount(0);
  await page.getByRole('button', {name: 'Sign and submit the accepted draft'}).click();
  await expect(page.getByTestId('action-done')).toContainText('delivered');
  expect(await methods(page)).toEqual(['submit_result']);

  const client = await browser.newPage();
  await signInAs(client, 'olive.testnet');
  await client.goto(`/jobs/${id}`);
  await client.getByRole('button', {name: 'Approve and pay'}).click();
  await expect(client.getByTestId('action-done')).toContainText('settled');
  expect(await methods(client)).toEqual(['approve']);
  await client.close();
});

test('the delivery is for the two parties only: a bystander sees none of it', async ({page}) => {
  let asked = 0;
  page.on('request', (r) => {
    if (/\/(drafts|files|messages)$/.test(new URL(r.url()).pathname)) asked++;
  });
  await signInAs(page, 'nora.testnet');
  await page.goto(`/jobs/${JOB(42)}`);
  await expect(page.getByTestId('not-a-party')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Drafts and review'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Conversation'})).toHaveCount(0);
  expect(asked).toBe(0);

  // And the API says no if asked directly.
  const res = await page.request.get(`${MOCK_API}/v1/jobs/${JOB(42)}/messages`, {
    headers: {authorization: `Bearer ps_nora.testnet_${'e'.repeat(32)}`},
  });
  expect(res.status()).toBe(403);
});

test('before the job is accepted, chat and drafts are closed', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${JOB(41)}`);
  await expect(page.getByTestId('chat-closed')).toBeVisible();
  await expect(page.getByLabel(/Draft 1/)).toHaveCount(0);
  await expect(page.getByLabel('Add a photo')).toHaveCount(0);
});

test('a worker’s words are shown as text, never as markup', async ({page}) => {
  const id = await fresh(page, JOB(40));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  const hostile = '<img src=x onerror="window.__pwned=1"> <b>bold</b>';
  await page.getByLabel('Your message').fill(hostile);
  await page.getByRole('button', {name: 'Send'}).click();
  await expect(page.getByRole('list', {name: 'Messages'})).toContainText('<b>bold</b>');
  expect(await page.evaluate(() => (window as unknown as {__pwned?: number}).__pwned)).toBeUndefined();
});

test('the client’s review panels pass an accessibility scan', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(42)}`);
  await expect(page.getByRole('form', {name: 'Review of draft 1'})).toBeVisible();
  await expect(page.getByTestId('photo-verified')).toBeVisible();
  await expectNoBlockingViolations(page, 'job delivery (client)');
});

test('the worker’s delivery panels pass an accessibility scan', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${JOB(40)}`);
  await expect(page.getByLabel('Add a photo')).toBeVisible();
  await expectNoBlockingViolations(page, 'job delivery (worker)');
});
