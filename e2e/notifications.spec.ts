import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, quietChain, signInAs} from './helpers';

// /me reads the chain for the money panel: a node that answers, not the internet.
test.beforeEach(async ({page}) => quietChain(page));

/**
 * Notifications and the test-token faucet (docs/26 F10, F23), against the
 * mock: `nell-…` accounts have 28 shown notifications with 6 unread, `fay-…` have
 * a faucet to claim from. Each test uses an account named after its browser,
 * reset first, so the browsers sharing the mock never share state.
 */

async function own(page: Page, info: TestInfo, prefix: 'nell' | 'fay'): Promise<string> {
  const account = `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  const r = await page.request.post(`${MOCK_API}/__test/feed/reset/${account}`);
  expect(r.ok()).toBe(true);
  return account;
}

test('the header shows the unread count, and the page lists, pages and marks read', async ({page}, info) => {
  const account = await own(page, info, 'nell');
  await signInAs(page, account);
  const bell = page.getByTestId('notifications-bell');
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 6 unread');
  await expect(page.getByTestId('notifications-badge')).toHaveText('6');

  await bell.click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Notifications');
  // Grouped by job or listing since 2026-11-09: count the items across the groups.
  const list = page.getByTestId('notification-groups');
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(page.getByTestId('notification-25')).toHaveAttribute('data-read', 'no');
  await expect(page.getByTestId('notification-22')).toHaveAttribute('data-read', 'yes');
  await expect(page.getByTestId('notification-25')).toContainText('— you are the');
  // The link sits on the group's heading, once for every item about that job.
  await expect(list.getByRole('link', {name: 'Open the job'}).first()).toHaveAttribute(
    'href',
    /^\/jobs\/[0-9a-f-]{36}$/,
  );
  // Opening the page does not mark anything read.
  await expect(page.getByTestId('unread-count')).toHaveText('6 unread');

  await page.getByRole('button', {name: 'Older'}).click();
  await expect(list.getByRole('listitem')).toHaveCount(28);
  await expect(page.getByRole('button', {name: 'Older'})).toHaveCount(0);

  await page.getByRole('button', {name: 'Mark all as read'}).click();
  await expect(page.getByTestId('unread-count')).toHaveText('All read');
  await expect(page.getByTestId('notification-25')).toHaveAttribute('data-read', 'yes');
  await expect(page.getByRole('button', {name: 'Mark all as read'})).toBeDisabled();

  // The header catches up on the next page.
  await page.goto('/jobs');
  await expect(page.getByTestId('notifications-bell')).toHaveAttribute('aria-label', 'Notifications');
  await expect(page.getByTestId('notifications-badge')).toHaveCount(0);
});

test('signed out, there is no bell, and the page asks to sign in', async ({page}) => {
  await page.goto('/jobs');
  // The page is up (the header's own sign-in link is hidden at phone width).
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await expect(page.getByTestId('notifications-bell')).toHaveCount(0);
  await page.goto('/notifications');
  await expect(
    page
      .getByRole('main')
      .getByText(/sign in/i)
      .first(),
  ).toBeVisible();
});

test('an account with no person record gets no bell', async ({page}) => {
  await signInAs(page, 'sam.testnet');
  await page.goto('/jobs');
  await expect(page.getByTestId('notifications-bell')).toHaveCount(0);
});

test('a person with nothing yet sees an empty page that says what will appear', async ({page}) => {
  await signInAs(page, 'nora.testnet');
  await page.goto('/notifications');
  await expect(page.getByText('No notifications yet')).toBeVisible();
});

test('the faucet: claim once, see the transaction, and be told to come back tomorrow', async ({
  page,
}, info) => {
  const account = await own(page, info, 'fay');
  await signInAs(page, account);
  await page.goto('/me');
  const card = page.getByRole('region', {name: 'Test tokens'});
  await expect(card).toContainText('once a day');
  await card.getByRole('button', {name: 'Claim test tokens'}).click();
  await expect(card.getByTestId('faucet-sent')).toContainText('from faucet.testnet');
  await expect(card.getByRole('link', {name: 'View transaction'})).toHaveAttribute(
    'href',
    /^https:\/\/testnet\.nearblocks\.io\/txns\//,
  );
  await page.reload();
  await expect(page.getByRole('region', {name: 'Test tokens'}).getByTestId('faucet-claimed')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Claim test tokens'})).toHaveCount(0);
});

test('the notifications page passes an accessibility scan', async ({page}, info) => {
  const account = await own(page, info, 'nell');
  await signInAs(page, account);
  await page.goto('/notifications');
  await expect(page.getByTestId('notification-groups')).toBeVisible();
  await expectNoBlockingViolations(page, 'notifications');
});

// Found in the manual live test of 2026-11-13: a signed-in account with no
// person record was told "Get test mUSDC from the faucet", but the link
// (/me#faucet) led nowhere, since the card was shown to people only. The API
// (routes/faucet.ts) lets any signed-in account claim; so does the page now.
test('an account with no person record still gets the faucet card, and can claim', async ({page}, info) => {
  const account = `newbie-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  await signInAs(page, account);
  await page.goto('/me#faucet');
  await expect(page.getByTestId('me-person')).toHaveText('None yet');
  const card = page.getByRole('region', {name: 'Test tokens'});
  await expect(card).toContainText('once a day');
  await card.getByRole('button', {name: 'Claim test tokens'}).click();
  await expect(card.getByTestId('faucet-sent')).toContainText('from faucet.testnet');
});
