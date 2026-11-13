import {expect, test} from '@playwright/test';
import {MOCK_API, expectNoBlockingViolations} from './helpers';

/**
 * The first-visit UX audit (2026-11-13), one test per finding that changes
 * behaviour. Each failed on the build before its fix.
 *
 * The mock's /v1/stats: 2 agents + 5 people listed, 12 jobs settled, 5
 * participants in a settled job. The recorded swarm run (lib/swarm-run.json)
 * settled 11 more, on chain but outside this site's database.
 */

test('the home page and /demo give the same numbers under the same labels, the swarm apart', async ({
  page,
}) => {
  for (const path of ['/', '/demo']) {
    await page.goto(path);
    const figures = page.getByTestId('live-figures');
    await expect(figures).toBeVisible();
    await expect(figures.getByTestId('figure-listed')).toContainText('7');
    await expect(figures.getByTestId('figure-listed')).toContainText('Agents and people listed');
    await expect(figures.getByTestId('figure-settled')).toContainText('12');
    await expect(figures.getByTestId('figure-settled')).toContainText(
      'Jobs settled on chain through this site',
    );
    await expect(figures.getByTestId('figure-with-record')).toContainText('5');
    await expect(figures.getByTestId('figure-with-record')).toContainText(
      'Agents and people in a settled job, as client or worker',
    );
    const swarm = page.getByTestId('swarm-extra');
    await expect(swarm).toContainText('+ 11 more settled in the recorded swarm run');
    await expect(swarm.getByRole('link')).toHaveAttribute('href', '/swarm');
  }
});

test('/demo puts the no-key paths first, above the key form', async ({page}) => {
  await page.goto('/demo');
  const nokey = page.getByRole('region', {name: /No key\?/});
  await expect(nokey).toBeVisible();
  await expect(nokey.getByRole('link', {name: /Watch a recorded run/})).toHaveAttribute('href', '#recording');
  await expect(nokey.getByRole('link', {name: /See the swarm/})).toHaveAttribute('href', '/swarm');
  await expect(nokey.getByRole('link', {name: /Verify receipts/})).toHaveAttribute('href', '/receipts');
  // Above the form in the page, so a visitor with no key reads it first.
  const key = page.getByLabel('Orchestrator API key');
  const above = await nokey.evaluate(
    (a, b) => Boolean(a.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING),
    await key.elementHandle(),
  );
  expect(above).toBe(true);
  await expectNoBlockingViolations(page, '/demo, no key first');
});

test('the quickstart’s no-setup path needs no key', async ({page}) => {
  await page.goto('/docs/quickstart');
  const watch = page.getByRole('heading', {name: /Watch a run — no setup/});
  await expect(watch).toBeVisible();
  const para = page.getByTestId('quickstart-watch');
  await expect(para).not.toContainText(/API key/);
  await expect(para.getByRole('link', {name: /recorded run/})).toBeVisible();
  await expect(para.getByRole('link', {name: /receipts/})).toHaveAttribute('href', '/receipts');
});

test('the hero says what mUSDC is, keeps to two sentences, and verifies on chain in one click', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('token-note')).toHaveText(
    'mUSDC is a test stablecoin on NEAR testnet; nothing here is real money.',
  );
  const lead = page.getByTestId('hero-lead');
  const text = (await lead.innerText()).trim();
  expect(text.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2);
  await expect(page.getByRole('link', {name: 'Verify a receipt on chain'})).toHaveAttribute(
    'href',
    '/receipts',
  );
  await expect(page.getByRole('link', {name: /How it works/}).first()).toBeVisible();
});

test('the 404 page is generic, with links to the main pages and the search', async ({page}) => {
  const res = await page.goto('/nonexistent-page-xyz');
  expect(res?.status()).toBe(404);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', {name: 'Not found'})).toBeVisible();
  await expect(main).not.toContainText(/Run links/);
  for (const [name, href] of [
    ['Home', '/'],
    ['Jobs', '/jobs'],
    ['Marketplace', '/agents'],
    ['Receipts', '/receipts'],
    ['Swarm', '/swarm'],
  ] as const) {
    await expect(main.getByRole('link', {name, exact: true})).toHaveAttribute('href', href);
  }
  await main.getByRole('button', {name: 'Search the site'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a listing id opened as a job goes to the listing', async ({page}) => {
  const id = 'aaaaaaaa-1111-4000-8000-000000000001';
  const view = await (await page.request.get(`${MOCK_API}/v1/listings/lst-view`)).json();
  await page.route(`**/v1/listings/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({...view, listingId: id}),
    }),
  );
  await page.goto(`/jobs/${id}`);
  await expect(page).toHaveURL(new RegExp(`/jobs/listing/${id}$`));
  await expect(page.getByRole('heading', {name: 'Photograph a shopfront'})).toBeVisible();
});

test('an id that is neither a job nor a listing still says the job was not found', async ({page}) => {
  await page.goto('/jobs/aaaaaaaa-1111-4000-8000-000000000999');
  await expect(page.getByRole('heading', {level: 1})).toContainText(/not found/i);
});

test('an agent page says which score is which, and which number is which', async ({page}) => {
  await page.goto('/agents/1');
  await expect(page.getByText('Reputation score', {exact: true})).toBeVisible();
  const ids = page.getByTestId('agent-ids');
  await expect(ids).toContainText('#1 is its number on this site');
  await expect(ids).toContainText('the contract numbers it 42');
  await expect(page.getByTestId('score-note')).toContainText(/trust score/i);
});

test('the trust check reads in proper English: "0 finished jobs", not "job(s)"', async ({page}) => {
  await page.goto('/agents/2');
  await expect(page.getByText(/0 finished jobs; at least 3/)).toBeVisible();
  await expect(page.getByText(/\(s\)/)).toHaveCount(0);
});

test('the home video plays the new opener without covering the poster’s headline', async ({page}) => {
  await page.goto('/');
  const poster = page.getByTestId('tour-poster-overview');
  await expect(poster.locator('img')).toHaveAttribute('src', '/video/hook-overview.jpg');
  const knob = await poster.locator('[data-play-knob]').boundingBox();
  const frame = await poster.boundingBox();
  // The knob sits in the corner, below the headline (the middle 30–60 % of the frame) and right of it.
  expect(knob!.y).toBeGreaterThan(frame!.y + frame!.height * 0.6);
  expect(knob!.x).toBeGreaterThan(frame!.x + frame!.width * 0.75);
  await poster.click();
  const video = page.getByTestId('tour-video-overview');
  await expect(video.locator('source')).toHaveAttribute('src', '/video/hook-overview-x.mp4');
  await expect(video.locator('track')).toHaveCount(0);
  for (const file of ['hook-overview.jpg', 'hook-overview-x.mp4']) {
    expect((await page.request.head(`/video/${file}`)).status(), file).toBe(200);
  }
});

test('the hero diagram text is at least 12 px', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/');
  const sizes = await page
    .locator('svg[role="img"] text')
    .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
});
