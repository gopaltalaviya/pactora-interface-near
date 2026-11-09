import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {MOCK_API, signInAs} from './helpers';

/**
 * Notifications after the 2026-11-09 round: the listing and bid event kinds
 * read as sentences and link to the listing; items are grouped by job or
 * listing with the title; one item can be marked read; the unread filter;
 * the bell catches up right after an action. Each test failed on the old build.
 */

async function own(page: Page, info: TestInfo): Promise<string> {
  const account = `nell-feed-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/feed/reset/${account}`)).ok()).toBe(true);
  return account;
}

test('listing events read as sentences, link to the listing, and the feed is grouped by title', async ({
  page,
}, info) => {
  const account = await own(page, info);
  await signInAs(page, account);
  await page.goto('/notifications');
  const groups = page.getByTestId('notification-groups');
  await expect(groups.getByRole('heading', {name: /Photograph a shopfront/})).toBeVisible();
  await expect(page.getByTestId('notification-26')).toContainText('New bid on your listing from Wade');
  await expect(page.getByTestId('notification-27')).toContainText('Your bid was selected');
  await expect(page.getByTestId('notification-28')).toContainText('A new listing matches your skills');
  await expect(
    groups.getByRole('heading', {name: /Fits a photographer/}).getByRole('link', {name: 'Open the listing'}),
  ).toHaveAttribute('href', '/jobs/listing/lst-match');
  // The API folds my own actions and chain echoes away: 29 and 30 are not shown.
  await expect(page.getByTestId('notification-29')).toHaveCount(0);
  await expect(page.getByTestId('notification-30')).toHaveCount(0);
  await expect(page.getByTestId('notification-25')).toContainText('— you are the client');
});

test('one notification can be marked read; the unread filter hides the read ones; the bell follows', async ({
  page,
}, info) => {
  const account = await own(page, info);
  await signInAs(page, account);
  await page.goto('/notifications');
  await expect(page.getByTestId('unread-count')).toHaveText('6 unread');
  await page
    .getByTestId('notification-28')
    .getByRole('button', {name: /Mark read/})
    .click();
  await expect(page.getByTestId('notification-28')).toHaveAttribute('data-read', 'yes');
  await expect(page.getByTestId('unread-count')).toHaveText('5 unread');
  await expect(page.getByTestId('notifications-badge')).toHaveText('5');
  await page.getByRole('button', {name: 'Unread'}).click();
  await expect(page.getByTestId('notification-28')).toHaveCount(0);
  await expect(page.getByTestId('notification-27')).toBeVisible();
  await page.getByRole('button', {name: 'All', exact: true}).click();
  await expect(page.getByTestId('notification-28')).toBeVisible();
});
