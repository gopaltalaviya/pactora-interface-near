import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {MOCK_API, signInAs} from './helpers';

/**
 * 2026-11-10 fixes: the admin console tells a failure from "no access" and
 * "nothing to do"; a session whose person record could not be read says so
 * instead of offering to join; /notifications without a person record says
 * how to get one; the job page shows its deadlines and who closes a job that
 * runs out of time, and tells an agent's owner that their agent is a party.
 */

const who = (prefix: string, info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;
const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

const fail = (page: Page, path: string | RegExp, status = 500) =>
  page.route(typeof path === 'string' ? `${MOCK_API}${path}` : path, (route) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      body: JSON.stringify({code: status === 500 ? 'INTERNAL' : 'FORBIDDEN', detail: 'boom'}),
    }),
  );

// ── admin ────────────────────────────────────────────────────────────────

test('admin: a failure to load the console is an error with Retry, not "No admin access"', async ({
  page,
}, info) => {
  await signInAs(page, who('cara', info));
  await fail(page, '/v1/admin/me');
  await page.goto('/admin');
  await expect(page.getByText('Could not load the admin console')).toBeVisible();
  await expect(page.getByText('No admin access')).toHaveCount(0);
  await page.unroute(`${MOCK_API}/v1/admin/me`);
  await page.getByRole('button', {name: 'Retry'}).click();
  await expect(page.getByTestId('admin-roles')).toContainText('Arbiter council');
});

test('admin: an account the API names no role for has no access and no Moderation tab', async ({
  page,
}, info) => {
  await signInAs(page, who('nobody', info));
  await page.route(`${MOCK_API}/v1/admin/me`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({account: 'x.testnet', chainId: 'near:testnet', roles: [], arbiterDao: null}),
    }),
  );
  await page.goto('/admin');
  await expect(page.getByText('No admin access')).toBeVisible();
  await expect(page.getByRole('tab', {name: 'Moderation'})).toHaveCount(0);
});

test('admin: disputes that fail to load are an error with Retry, never "No open disputes"', async ({
  page,
}, info) => {
  await signInAs(page, who('cara', info));
  await fail(page, '/v1/admin/disputes');
  await page.goto('/admin');
  await expect(page.getByText('Could not load the disputes')).toBeVisible();
  await expect(page.getByText('No open disputes')).toHaveCount(0);
  await page.unroute(`${MOCK_API}/v1/admin/disputes`);
  await page.getByRole('button', {name: 'Retry'}).click();
  await expect(
    page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}),
  ).toBeVisible();
});

test('admin: proposals that fail to load are an error, not an empty list', async ({page}, info) => {
  await signInAs(page, who('cara', info));
  await fail(page, `/v1/admin/disputes/${JOB(50)}/proposals`);
  await page.goto('/admin');
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  await expect(page.getByText('Could not load the proposals')).toBeVisible();
});

test('admin: Propose and Vote are busy and disabled while the wallet call is on its way', async ({
  page,
}, info) => {
  await signInAs(page, who('cara', info));
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route(`${MOCK_API}/v1/admin/disputes/${JOB(50)}/proposal`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/admin');
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  await page.getByRole('button', {name: 'Propose: pay the worker'}).click();
  await expect(page.getByRole('button', {name: 'Propose: pay the worker'})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Propose: refund the client'})).toBeDisabled();
  release();
  await expect(page.getByTestId('desk-notice')).toContainText('Proposed');
  await expect(page.getByRole('button', {name: 'Propose: refund the client'})).toBeEnabled();

  let releaseVote: () => void = () => undefined;
  const heldVote = new Promise<void>((r) => (releaseVote = r));
  await page.route(/\/v1\/admin\/disputes\/[^/]+\/proposals\/\d+\/vote$/, async (route) => {
    await heldVote;
    await route.continue();
  });
  const row = page.getByRole('list', {name: 'Proposals'}).getByRole('listitem').last();
  await row.getByRole('button', {name: 'Approve'}).click();
  await expect(row.getByRole('button', {name: 'Approve'})).toBeDisabled();
  await expect(row.getByRole('button', {name: 'Reject'})).toBeDisabled();
  releaseVote();
  await expect(page.getByTestId('desk-notice')).toContainText('Vote sent');
});

test('admin on a phone: the tab row wraps and a proposal row fits the screen', async ({page}, info) => {
  await page.setViewportSize({width: 320, height: 720});
  await signInAs(page, who('cara', info));
  await page.route(`${MOCK_API}/v1/admin/me`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        account: who('cara', info),
        chainId: 'near:testnet',
        roles: ['council', 'reviewer'],
        arbiterDao: 'pactora-arbiter.sputnikv2.testnet',
        arbiter: 'pactora-arbiter.sputnikv2.testnet',
      }),
    }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('tab')).toHaveCount(4);
  for (const tab of await page.getByRole('tab').all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x + box.width, await tab.innerText()).toBeLessThanOrEqual(320);
  }
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  await page.getByRole('button', {name: 'Propose: refund the client'}).click();
  const row = page.getByRole('list', {name: 'Proposals'}).getByRole('listitem').last();
  await row.getByRole('button', {name: 'Reject'}).click();
  await expect(row.getByRole('button', {name: 'Confirm the Reject vote'})).toBeVisible();
  for (const button of await row.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

// ── the session, when the API cannot be reached ─────────────────────────────

test('session: an API that cannot be reached is an error with Retry, never a prompt to join', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.route(`${MOCK_API}/v1/session`, (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await page.goto('/notifications');
  await expect(page.getByTestId('session-problem')).toContainText('Could not read your account');
  await expect(page.locator('main').getByRole('link', {name: 'Join as a person'})).toHaveCount(0);
  await expect(page.getByTestId('join-for-notifications')).toHaveCount(0);
  await page.unroute(`${MOCK_API}/v1/session`);
  await page.getByTestId('session-problem').getByRole('button', {name: 'Retry'}).click();
  await expect(page.getByTestId('session-problem')).toHaveCount(0);
  await expect(page.getByText('No notifications yet')).toBeVisible();
});

// ── notifications without a person record ───────────────────────────────

test('notifications: an account with no person record is told how to get one, not an error', async ({
  page,
}, info) => {
  await signInAs(page, who('stranger', info));
  await page.goto('/notifications');
  const join = page.getByTestId('join-for-notifications');
  await expect(join).toBeVisible();
  await expect(join.getByRole('link', {name: 'Join as a person'})).toHaveAttribute('href', '/join');
  await expect(page.getByText('Could not load your notifications')).toHaveCount(0);
});

// ── the job page: deadlines, the keeper, an agent owner ─────────────────────

test('job: the deadlines come from the API, with the keeper line', async ({page}) => {
  await page.goto(`/jobs/${JOB(70)}`);
  const card = page.getByTestId('job-deadlines');
  await expect(card).toContainText('Deliver by');
  await expect(card).toContainText('1 Jan 2099, 12:00 UTC');
  await expect(card).toContainText('Accept by');
  await expect(card).toContainText('passed');
  await expect(card).toContainText('keeper');
});

test('job: before the API says, the windows from the network are shown', async ({page}) => {
  await page.goto(`/jobs/${JOB(71)}`);
  const card = page.getByTestId('job-deadlines');
  await expect(card).toContainText('10 minutes to accept');
  await expect(card).toContainText('30 minutes to deliver');
  await expect(card).toContainText('keeper');
});

test('job: the owner of an agent that is a party is told so, with a link to manage it', async ({page}) => {
  await signInAs(page, 'owner.testnet');
  await page.goto(`/jobs/${JOB(71)}`);
  const party = page.getByTestId('agent-party');
  await expect(party).toContainText('Your agent ResearchBot is the worker');
  await expect(party.getByRole('link', {name: /Manage/})).toHaveAttribute('href', '/agents/42/manage');
  await expect(page.getByTestId('not-a-party')).toHaveCount(0);
});
