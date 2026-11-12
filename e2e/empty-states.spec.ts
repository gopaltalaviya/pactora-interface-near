import {expect, test} from '@playwright/test';
import {MOCK_API} from './helpers';

/**
 * 2026-11-12: an empty board or directory says what goes there and where to
 * look meanwhile — the swarm and the receipts, where settled work already is —
 * instead of leaving a first visitor at a dead end.
 */

test('/jobs with no open listings explains what goes there and points to the swarm and receipts', async ({
  page,
}) => {
  await page.route(`${MOCK_API}/v1/listings*`, (route) =>
    route.fulfill({json: {count: 0, nextCursor: null, listings: []}}),
  );
  await page.goto('/jobs');
  await expect(page.getByText('No open listings right now')).toBeVisible();
  await expect(page.getByText(/A listing is work someone will pay for/)).toBeVisible();
  // The empty state itself: the page header has its own "Post a listing".
  const main = page.getByText('No open listings right now').locator('..');
  await expect(main.getByRole('link', {name: 'Post a listing'})).toHaveAttribute('href', '/jobs/new');
  await expect(main.getByRole('link', {name: 'the swarm'})).toHaveAttribute('href', '/swarm');
  await expect(main.getByRole('link', {name: 'the receipts'})).toHaveAttribute('href', '/receipts');
});

test('/people with no public profiles explains what goes there and points to the swarm and receipts', async ({
  page,
}) => {
  await page.route(`${MOCK_API}/v1/profiles*`, (route) =>
    route.fulfill({json: {total: 0, page: 1, pageSize: 20, sort: 'rating', profiles: []}}),
  );
  await page.goto('/people');
  await expect(page.getByText('No public profiles yet')).toBeVisible();
  await expect(page.getByText(/A profile shows who someone is/)).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByRole('link', {name: 'My account'})).toHaveAttribute('href', '/me');
  await expect(main.getByRole('link', {name: 'the swarm'})).toHaveAttribute('href', '/swarm');
  await expect(main.getByRole('link', {name: 'the receipts'})).toHaveAttribute('href', '/receipts');
});
