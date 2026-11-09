import {expect, test, type Page} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs, txs} from './helpers';

/**
 * The job page after the 2026-11-09 round: a worker's decline (off chain, a
 * confirmation, nothing signed), the client's dispute evidence (notes and
 * photos both parties see, and the admin desk shows), the judge attestation,
 * titles from the listing, the refund-after-dispute words, the delivered
 * result as fields with the JSON behind a toggle. Each test failed on the
 * old build.
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

async function fresh(page: Page, template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/job/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

test('a worker declines an offered job: a reason, a confirmation, no signature, and the client is told', async ({
  page,
}) => {
  const id = await fresh(page, JOB(14));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  await page.getByRole('button', {name: 'Decline the job'}).click();
  const form = page.getByTestId('decline-form');
  await expect(form).toBeVisible();
  await expect(page.getByLabel('Why are you declining?')).toBeFocused();
  await expect(page.getByTestId('will-sign-decline')).toContainText(/Nothing is signed/);
  await page.getByRole('button', {name: 'Confirm: decline the job'}).click();
  await expect(page.getByText('Say why, in a sentence.')).toBeVisible();
  await page.getByLabel('Why are you declining?').fill('Too far away for me this week.');
  await page.getByRole('button', {name: 'Confirm: decline the job'}).click();
  await expect(page.getByTestId('action-done')).toContainText(/declined/);
  expect(await txs(page)).toHaveLength(0);
  await expect(page.getByTestId('state-plain')).toContainText('Too far away for me this week.');
  const prepared = await (await page.request.get(`${MOCK_API}/__test/job/${id}/prepared`)).json();
  expect(prepared.prepared).toEqual(['decline']);
  expect(prepared.confirmCount).toBe(0);
});

test('the client adds dispute evidence on a delivered job; the worker sees it; the desk bundles it', async ({
  page,
  browser,
}, info) => {
  const id = await fresh(page, JOB(5));
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Dispute evidence'});
  await expect(card).toBeVisible();
  await card.getByLabel('Add a note').fill('The second photo shows the wrong street sign.');
  await card.getByRole('button', {name: 'Add the note'}).click();
  await expect(card.getByTestId('dispute-note')).toContainText('wrong street sign');
  await card.getByLabel('Add a photo').setInputFiles({name: 'proof.png', mimeType: 'image/png', buffer: PNG});
  await expect(card.getByTestId('dispute-photo')).toHaveCount(1);
  await expect(card.getByTestId('dispute-photo')).toContainText('sha256 matches');

  // The worker reads it, and cannot add to it.
  const other = await browser.newContext();
  const worker = await other.newPage();
  await signInAs(worker, 'wade.testnet');
  await worker.goto(`/jobs/${id}`);
  const theirs = worker.getByRole('region', {name: 'Dispute evidence'});
  await expect(theirs.getByTestId('dispute-note')).toContainText('wrong street sign');
  await expect(theirs.getByLabel('Add a note')).toHaveCount(0);
  await other.close();

  // The desk: JOB(50) is the disputed fixture the desk lists; its evidence bundle shows notes and photos.
  const desk = await browser.newContext();
  const council = await desk.newPage();
  await council.request.post(`${MOCK_API}/__test/clone/job/${JOB(50)}`);
  const cara = `cara-jobpage-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  await signInAs(council, cara);
  // Add a note on the desk's own dispute (JOB 50) as its client.
  const r = await council.request.post(`${MOCK_API}/v1/jobs/${JOB(50)}/dispute/notes`, {
    headers: {authorization: `Bearer ps_olive.testnet_${'e'.repeat(32)}`, 'content-type': 'application/json'},
    data: {text: 'Desk note from the client.'},
  });
  expect(r.ok()).toBe(true);
  await council.goto('/admin');
  await council
    .getByRole('list', {name: 'Disputes'})
    .getByRole('button', {name: /Job 7050/})
    .click();
  await expect(council.getByTestId('desk-dispute-notes')).toContainText('Desk note from the client.');
  await expect(council.getByTestId('dispute-amount')).toContainText('4 USDC');
  await desk.close();
});

test('the judge attestation shows on a job and on a run step, with whether the signature verified', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB(1)}`);
  const judge = page.getByRole('region', {name: 'Judge attestation'});
  await expect(judge).toContainText('deepseek-v3');
  await expect(judge).toContainText('Signature verified');
  await expect(judge.getByTestId('judge-attestation')).toContainText('ab'.repeat(32));

  await page.goto('/runs/3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b');
  await expect(page.getByTestId('judge-attestation')).toContainText('resp_7f3a9c');
  await expect(page.getByText('signature verified')).toBeVisible();
});

test('a job is titled by its listing, linked to it, and the tab says so; a refund after a ruling reads as one', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB(42)}`);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Photograph two shop fronts');
  await expect(page).toHaveTitle(/Photograph two shop fronts/);
  await expect(page.getByTestId('job-listing-link')).toHaveAttribute('href', '/jobs/listing/lst-shop');

  await page.goto(`/jobs/${JOB(60)}`);
  await expect(page.getByTestId('state-plain')).toContainText('The arbiter ruled for the client');
  await expect(page.getByTestId('state-plain')).not.toContainText('Cancelled');

  await page.goto('/jobs/listing/lst-view');
  await expect(page).toHaveTitle(/Photograph a shopfront/);
});

test('the delivered result reads as fields, with the JSON behind a toggle that the keyboard can reach', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB(1)}`);
  const result = page.getByRole('region', {name: 'Delivered result'});
  await expect(result).toContainText('Done.');
  const pre = result.getByRole('region', {name: 'The delivered result as JSON'});
  await expect(pre).toBeHidden();
  await result.getByText('The result as JSON').click();
  await expect(pre).toBeVisible();
  await expect(pre).toHaveAttribute('tabindex', '0');
});

test('a client on an accepted job is told cancelling is no longer possible, and why', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(13)}`);
  await expect(page.getByTestId('no-action')).toContainText(
    /Cancelling is possible only before the worker accepts/,
  );
});

test('the job page with dispute evidence passes an accessibility scan', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(5)}`);
  await expect(page.getByRole('region', {name: 'Dispute evidence'})).toBeVisible();
  await expectNoBlockingViolations(page, 'job with dispute evidence');
});
