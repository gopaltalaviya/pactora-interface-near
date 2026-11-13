import {expect, test} from '@playwright/test';

/**
 * The home page names both audiences (2026-11-09): AI agents hiring each
 * other, and people who post listings, bid and get paid on chain. Its live
 * figures come from GET /v1/stats, which counts people as well as agents.
 */

test('the hero names people as well as agents, and a "For people" section links to /join and /jobs', async ({
  page,
}) => {
  await page.goto('/');
  const hero = page.getByRole('heading', {level: 1});
  await expect(hero).toBeVisible();
  // 2026-11-12: the hero says it in plain words: hire an AI agent or a person.
  await expect(hero).toContainText(/an AI agent or a person/);
  const section = page.getByRole('region', {name: /For people/});
  await expect(section).toBeVisible();
  await expect(section.getByRole('link', {name: /Join as a person/})).toHaveAttribute('href', '/join');
  await expect(section.getByRole('link', {name: /Browse (the )?jobs|See the work on offer/})).toHaveAttribute(
    'href',
    '/jobs',
  );
  // The watch link stays; with the captioned videos it leads to the overview on this page.
  await expect(page.getByRole('link', {name: /Watch agents pay each other/})).toHaveAttribute(
    'href',
    '#tour',
  );
});

test('the live figures count people too: settled jobs and participants with a record come from /v1/stats', async ({
  page,
}) => {
  await page.goto('/');
  const figures = page.getByRole('region', {name: 'Live on NEAR'});
  // The mock's /v1/stats says 12 settled jobs and 5 participants; the agents
  // list alone would say 3 and 1.
  await expect(figures.getByText('12', {exact: true})).toBeVisible();
  await expect(figures).toContainText(/Agents and people in a settled job, as client or worker/);
  await expect(figures.getByText('5', {exact: true})).toBeVisible();
  await expect(figures).toContainText(/Agents and people listed/);
});

test('"Start here": three numbered steps under the hero lead to the swarm, a receipt and the demo', async ({
  page,
}) => {
  await page.goto('/');
  const steps = page.getByRole('list', {name: 'Start here: three steps'});
  await expect(steps).toBeVisible();
  await expect(steps.getByRole('listitem')).toHaveCount(3);
  await expect(steps.getByRole('listitem').nth(0)).toContainText('See the swarm');
  await expect(steps.getByRole('listitem').nth(0)).toContainText(
    'press Verify on chain: your browser checks every job on NEAR',
  );
  await expect(steps.getByRole('listitem').nth(1)).toContainText('Check a receipt');
  await expect(steps.getByRole('listitem').nth(2)).toContainText('Watch the demo');
  await expect(steps.getByRole('link', {name: 'Open the swarm'})).toHaveAttribute('href', '/swarm');
  await expect(steps.getByRole('link', {name: 'Open the receipts'})).toHaveAttribute('href', '/receipts');
  await expect(steps.getByRole('link', {name: 'Open the demo'})).toHaveAttribute('href', '/demo');
  // The hero's own buttons are unchanged, and still the only links with their names.
  await expect(page.getByRole('link', {name: 'See the swarm'})).toHaveAttribute('href', '/swarm');
});

test('"Start here" does not move when the live data arrives', async ({page}) => {
  // Reduced motion: the page's 8px entrance (app/template.tsx) is a transform, not a layout shift.
  await page.emulateMedia({reducedMotion: 'reduce'});
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/v1\/(network|agents|stats)/, async (route) => {
    await held;
    await route.fallback();
  });
  await page.goto('/');
  const steps = page.getByRole('list', {name: 'Start here: three steps'});
  await expect(steps).toBeVisible();
  const before = await steps.boundingBox();
  release();
  await expect(page.getByRole('region', {name: 'Live on NEAR'}).getByText('12', {exact: true})).toBeVisible();
  const after = await steps.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
});
