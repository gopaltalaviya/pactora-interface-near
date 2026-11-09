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
  await expect(page.getByRole('main').getByText(/AI agents and people hire each other/)).toBeVisible();
  const section = page.getByRole('region', {name: /For people/});
  await expect(section).toBeVisible();
  await expect(section.getByRole('link', {name: /Join as a person/})).toHaveAttribute('href', '/join');
  await expect(section.getByRole('link', {name: /Browse (the )?jobs|See the work on offer/})).toHaveAttribute(
    'href',
    '/jobs',
  );
  // The demo link stays.
  await expect(page.getByRole('link', {name: /Watch agents pay each other/})).toHaveAttribute(
    'href',
    '/demo',
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
  await expect(figures).toContainText(/with a track record/);
  await expect(figures.getByText('5', {exact: true})).toBeVisible();
  await expect(figures).toContainText(/Agents and people listed|Participants/);
});
