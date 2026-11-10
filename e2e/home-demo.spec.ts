import {expect, test} from '@playwright/test';

/**
 * The home page and the demo say what is true about them (2026-11-10):
 * the four directions a deal can go, a badge that does not oversell a
 * testnet, demo examples that a cached API can actually replay, and a
 * diagram that is still readable on a phone.
 */

test('the home page shows four ways to deal, each with its link', async ({page}) => {
  await page.goto('/');
  const section = page.getByRole('region', {name: 'Four ways to deal'});
  await expect(section).toBeVisible();
  const items = section.getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText(/Agent → agent/);
  await expect(items.nth(0).getByRole('link')).toHaveAttribute('href', '/docs/quickstart');
  await expect(items.nth(1)).toContainText(/Agent → person/);
  await expect(items.nth(1).getByRole('link')).toHaveAttribute('href', '/jobs');
  await expect(items.nth(2)).toContainText(/Person → agent/);
  await expect(items.nth(2)).toContainText(/Hire this agent/);
  await expect(items.nth(2)).toContainText(/bid_on_listing/);
  await expect(items.nth(2).getByRole('link')).toHaveAttribute('href', '/agents');
  await expect(items.nth(3)).toContainText(/Person → person/);
  await expect(items.nth(3).getByRole('link')).toHaveAttribute('href', '/jobs/new');
});

test('the hero badge says testnet and test tokens, not "real jobs"', async ({page}) => {
  await page.goto('/');
  const hero = page.getByRole('main');
  await expect(hero.getByRole('link', {name: /NEAR Testnet/})).toBeVisible();
  await expect(hero.getByRole('link', {name: /NEAR Testnet/})).toContainText(/test tokens/);
  await expect(hero).not.toContainText(/Settling real jobs/);
});

test('without the tour video, the hero CTA goes to /demo and says what is there', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('link', {name: /Watch agents pay each other/})).toHaveAttribute(
    'href',
    '/demo',
  );
  await expect(page.getByTestId('hero-cta-note')).toContainText(/recorded run|your own key/);
  await expect(page.locator('video')).toHaveCount(0);
});

test('in cached mode the demo offers only the goal the API has a recording for', async ({page}) => {
  await page.goto('/demo');
  const chips = page.getByRole('button', {name: /^Use example:/});
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAccessibleName(
    'Use example: Research ETH/USDC liquidity on NEAR and tell me whether to open a position.',
  );
  await expect(page.getByTestId('cached-note')).toContainText(/recorded/);
});

test('a visitor without a key gets a "watch instead" slot on /demo', async ({page}) => {
  await page.goto('/demo');
  const slot = page.getByRole('region', {name: /No key\? Watch instead/});
  await expect(slot).toBeVisible();
  await expect(slot.getByRole('link', {name: /past runs/})).toHaveAttribute('href', '/runs');
});

test('on a phone the hero diagram labels are readable', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  const label = page.getByText('Photographer', {exact: true}).locator('visible=true').first();
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(11);
});
