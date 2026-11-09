import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs} from './helpers';

/**
 * /me after the 2026-11-09 round: tabs (docs/27 §4: the page was long on a
 * phone), the three loads in parallel, a Sessions card, the "Your data" card
 * (GDPR export and two-step deletion), the Admin link in the account menu for
 * council members and reviewers only, and the clearer notifications empty
 * state. Each test failed on the old build.
 */

const who = (prefix: string, info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;

async function freshPerson(page: Page, info: TestInfo, prefix = 'acct'): Promise<string> {
  const account = who(prefix, info);
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  return account;
}

test('/me is in tabs, and the hash picks one', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/me');
  const tabs = page.getByRole('tablist', {name: 'Account sections'});
  await expect(tabs.getByRole('tab')).toHaveCount(5);
  await expect(tabs.getByRole('tab', {name: 'Overview'})).toHaveAttribute('aria-selected', 'true');
  // Only the selected section is in the document.
  await expect(page.getByRole('region', {name: 'My listings'})).toHaveCount(0);
  await tabs.getByRole('tab', {name: 'Listings'}).click();
  await expect(page).toHaveURL(/#listings$/);
  await expect(page.getByRole('region', {name: 'My listings'})).toBeVisible();
  await page.goto('/me#jobs');
  await expect(tabs.getByRole('tab', {name: 'Jobs'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', {name: 'My jobs'})).toBeVisible();
});

test('the account, the jobs and the listings are asked for at the same time, not one after another', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  const order: string[] = [];
  await page.route(
    (url) => url.pathname === '/v1/me',
    async (route) => {
      order.push('me:asked');
      await new Promise((r) => setTimeout(r, 1200));
      order.push('me:answered');
      await route.continue();
    },
  );
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/v1/jobs') order.push('jobs:asked');
    if (u.pathname === '/v1/faucet') order.push('faucet:asked');
  });
  await page.goto('/me');
  await expect(page.getByTestId('me-earned')).toBeVisible();
  const faucetAt = order.indexOf('faucet:asked');
  const meAnswered = order.indexOf('me:answered');
  expect(faucetAt, order.join(' ')).toBeGreaterThanOrEqual(0);
  expect(faucetAt, order.join(' ')).toBeLessThan(meAnswered);

  // The jobs tab asks for the jobs without waiting for /v1/me at all.
  order.length = 0;
  await page.goto('/me#jobs');
  await expect(page.getByRole('region', {name: 'My jobs'}).getByTestId('my-job').first()).toBeVisible();
  expect(order, order.join(' ')).toContain('jobs:asked');
  expect(order.indexOf('jobs:asked')).toBeLessThan(
    order.includes('me:answered') ? order.indexOf('me:answered') : Number.POSITIVE_INFINITY,
  );
});

test('a Sessions card on /me signs out everywhere', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/me#settings');
  const card = page.getByRole('region', {name: 'Sessions'});
  await expect(card).toContainText(/Session ends/);
  const deleted = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith('/v1/sessions'));
  await card.getByRole('button', {name: 'Sign out everywhere'}).click();
  await card.getByRole('button', {name: 'Yes, sign out everywhere'}).click();
  await deleted;
  await expect(
    page
      .getByRole('main')
      .getByText(/Sign in/)
      .first(),
  ).toBeVisible();
});

test('the notifications empty state says what counts as a notification', async ({page}) => {
  await signInAs(page, 'nora.testnet');
  await page.goto('/notifications');
  await expect(page.getByText('No notifications yet')).toBeVisible();
  await expect(page.getByText(/reviews .* not notifications|Reviews are not/i)).toBeVisible();
});

test('the account menu shows Admin to a council member and a reviewer, and to nobody else', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'the phone menu is checked separately');
  await signInAs(page, who('cara', info));
  await page.goto('/jobs');
  await page
    .getByRole('banner')
    .getByRole('button', {name: /Account menu/})
    .click();
  const menu = page.getByRole('menu', {name: 'Account'});
  await expect(menu.getByRole('menuitem', {name: 'Admin'})).toHaveAttribute('href', '/admin');
  await expect(menu.getByRole('menuitem', {name: 'My account'})).toHaveAttribute('href', '/me');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page
    .getByRole('banner')
    .getByRole('button', {name: /Account menu/})
    .click();
  await menu.getByRole('menuitem', {name: 'Sign out'}).click();
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs');
  await page
    .getByRole('banner')
    .getByRole('button', {name: /Account menu/})
    .click();
  await expect(page.getByRole('menu', {name: 'Account'})).toBeVisible();
  await expect(page.getByRole('menu', {name: 'Account'}).getByRole('menuitem', {name: 'Admin'})).toHaveCount(
    0,
  );
});

test('the phone menu shows Admin to a reviewer only', async ({page}, info) => {
  await page.setViewportSize({width: 390, height: 844});
  await signInAs(page, who('rhea', info));
  await page.goto('/');
  await page.getByRole('button', {name: 'Open menu'}).click();
  await expect(page.locator('#mobile-nav').getByRole('link', {name: 'Admin'})).toHaveAttribute(
    'href',
    '/admin',
  );
  await page.getByRole('link', {name: 'My account'}).click();
  // Let that navigation land: a goto on top of it is aborted (Firefox).
  await page.waitForURL(/\/me(#.*)?$/);
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  await signInAs(page, 'wade.testnet');
  await page.goto('/');
  await page.getByRole('button', {name: 'Open menu'}).click();
  await expect(page.locator('#mobile-nav').getByRole('link', {name: 'My account'})).toBeVisible();
  await expect(page.locator('#mobile-nav').getByRole('link', {name: 'Admin'})).toHaveCount(0);
});

test('Your data: export downloads the JSON; deletion is two steps and shows the refusal with its reasons', async ({
  page,
}, info) => {
  const account = await freshPerson(page, info, 'gdpr');
  await signInAs(page, account);
  await page.goto('/me#settings');
  const card = page.getByRole('region', {name: 'Your data'});
  await expect(card).toContainText(/on-chain data cannot be deleted/i);
  const download = page.waitForEvent('download');
  await card.getByRole('button', {name: 'Export my data'}).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^pactora-export-.*\.json$/);

  await card.getByRole('button', {name: 'Delete my account'}).click();
  await expect(card.getByText(/cannot be undone/i)).toBeVisible();
  // The mock refuses while a job is open, naming it.
  await card.getByRole('button', {name: 'Yes, delete my account'}).click();
  await expect(card.getByRole('alert')).toContainText(/open job/i);
  await expect(card.getByRole('link', {name: /Open job/}).first()).toHaveAttribute('href', /^\/jobs\//);
});

test('deleting an account with nothing open signs the tab out and says what was removed', async ({
  page,
}, info) => {
  const account = await freshPerson(page, info, 'gdprok');
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}/no-open-jobs`)).ok()).toBe(true);
  await signInAs(page, account);
  await page.goto('/me#settings');
  const card = page.getByRole('region', {name: 'Your data'});
  await card.getByRole('button', {name: 'Delete my account'}).click();
  await card.getByRole('button', {name: 'Yes, delete my account'}).click();
  await expect(page.getByTestId('account-deleted')).toContainText(/deleted/i);
  await expect(page.getByTestId('account-deleted')).toContainText(/profile/);
  await page.goto('/me');
  await expect(
    page
      .getByRole('main')
      .getByText(/Sign in/)
      .first(),
  ).toBeVisible();
});

test('the standing banner warns a held person before the form, on /me and /jobs/new', async ({
  page,
}, info) => {
  const account = await freshPerson(page, info, 'held');
  expect((await page.request.post(`${MOCK_API}/__test/standing/${account}/hold`)).ok()).toBe(true);
  await signInAs(page, account);
  await page.goto('/me');
  await expect(page.getByTestId('standing-banner')).toContainText(/on hold/i);
  await page.goto('/jobs/new');
  await expect(page.getByTestId('standing-banner')).toContainText(/on hold/i);
});

test('my bids are listed on /me with the listing they are on', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto('/me#jobs');
  const bids = page.getByRole('region', {name: 'My bids'});
  await expect(bids).toBeVisible();
  const row = bids.getByRole('listitem').first();
  await expect(row.getByRole('link').first()).toHaveAttribute('href', /^\/jobs\/listing\//);
  await expect(row).toContainText(/pending|selected|rejected|withdrawn/);
});

test('the account tabs pass an accessibility scan', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await signInAs(page, 'olive.testnet');
  for (const tab of ['overview', 'profile', 'jobs', 'listings', 'settings']) {
    await page.goto(`/me#${tab}`);
    await expect(page.getByRole('tab', {selected: true})).toBeVisible();
    await expectNoBlockingViolations(page, `/me#${tab}`);
  }
});
