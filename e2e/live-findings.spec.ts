import {expect, test} from '@playwright/test';
import {signInAs} from './helpers';

/** A settled job in the mock (e2e/jobs.spec.ts JOB(1)). */
const JOB1 = 'aaaaaaaa-0000-4000-8000-000000000001';

/**
 * Findings of the manual live test of 2026-11-13 (the owner's account on the
 * live site, every flow on NEAR testnet). Each test failed on the code of that
 * day; the number is the finding's in the test report.
 */

test('#1 a focused text field shows one ring that follows its rounded frame, not a square outline inside it', async ({
  page,
}) => {
  await signInAs(page, 'focus-ring.testnet');
  await page.goto('/join');
  const input = page.locator('#join-name');
  await input.focus();
  // The input itself draws no outline: the global :focus-visible rule used to
  // beat the utility `outline-none`, so a square outline sat inside the frame.
  await expect.poll(() => input.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  // The frame shows the focus instead, on its own rounded corners.
  const frame = input.locator('xpath=..');
  await expect
    .poll(() => frame.evaluate((el) => getComputedStyle(el).boxShadow))
    .toContain('rgba(110, 168, 255');
  // A link reached by keyboard still gets the visible outline (the skip link comes first).
  await page.reload();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect.poll(() => focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('#10 #24 #25 a signed-in person gets "Post a listing" in the header; the account menu has icons; people and agents are told apart', async ({
  page,
}) => {
  await page.setViewportSize({width: 1600, height: 900});
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs');
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('link', {name: 'Post a listing'})).toBeVisible();
  await banner.getByRole('button', {name: /Account menu/}).click();
  const menu = page.getByRole('menu', {name: 'Account'});
  for (const item of ['My account', 'Notifications', 'Register an agent', 'Sign out']) {
    await expect(menu.getByRole('menuitem', {name: item})).toBeVisible();
  }
  // Every menu item carries an icon.
  expect(
    await menu.getByRole('menuitem').evaluateAll((els) => els.every((e) => e.querySelector('svg'))),
  ).toBe(true);
  await page.goto('/people');
  await expect(page.locator('[data-kind="person"]').first()).toBeVisible();
  await expect(page.locator('[data-kind="agent"]').first()).toBeVisible();
  await page.goto('/agents');
  await expect(page.locator('[data-kind="agent"]').first()).toBeVisible();
});

test('#2 a wallet the browser remembers is the owner on /register, without "Connect a wallet"', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.addInitScript(() => {
    (window as unknown as {__pactoraTestWalletRemembered: boolean}).__pactoraTestWalletRemembered = true;
  });
  await page.goto('/register');
  await expect(page.getByText('owner olive.testnet')).toBeVisible();
  await expect(page.getByRole('button', {name: /Connect wallet/})).toHaveCount(0);
  await expect(page.getByText(/Before you can register: Connect a wallet/)).toHaveCount(0);
});

test('#17 the terms acceptance is recorded on the account, not only in this browser', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  // Accepted at /join before 2026-11-13: only this browser knew.
  await page.addInitScript(() =>
    window.localStorage.setItem('pactora.terms.olive.testnet', '2026-11-12T09:20:00.000Z'),
  );
  await page.goto('/me');
  await expect(page.getByTestId('terms-accepted')).toContainText('recorded on your account');
});

test('the job page names its client and worker, says how it is paid, and explains its terms', async ({
  page,
}) => {
  await page.goto(`/jobs/${JOB1}`);
  await expect(page.getByTestId('fact-client')).toBeVisible();
  await expect(page.getByTestId('fact-worker')).toBeVisible();
  await expect(page.getByTestId('fact-payment-path')).toContainText(/escrow|direct/);
  // Each term links to where the concepts page explains it.
  await expect(page.locator('a[data-term="bond"]').first()).toHaveAttribute('href', '/docs/concepts#bonds');
  await expect(page.locator('a[data-term="escrow"]').first()).toHaveAttribute(
    'href',
    '/docs/concepts#lifecycle',
  );
  // The parties are named, with a person or agent badge.
  await expect(page.getByTestId('job-party').first()).toBeVisible();
});

test('/jobs/new says the fee, the limits and the default windows; the board counts its listings', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  await expect(page.getByText(/fee comes out of what they receive/)).toBeVisible();
  await expect(
    page.getByText(/Empty uses the network default \(\d+ (minutes|hours)\)/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Physical: someone goes somewhere/)).toBeVisible();
  await page.goto('/jobs');
  await expect(page.getByTestId('board-count')).toContainText(/open listing/);
});

test('the concepts page has the sections the terms link to', async ({page}) => {
  await page.goto('/docs/concepts');
  for (const id of ['purse', 'keeper', 'disputes', 'credentials', 'bonds', 'caps', 'paths']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});
