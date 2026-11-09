import {expect, test} from '@playwright/test';

/**
 * The record over time (Round 3, 2026-11-09) against the mock: the weekly
 * history behind the agent and profile charts (GET /v1/agents/:id/history,
 * GET /v1/profiles/:id/history), with its loading, empty and error states.
 */

test.describe('the record over time', () => {
  test('an agent page charts the jobs it closed each week and its rating, with the figures as tables', async ({
    page,
  }) => {
    await page.goto('/agents/1');
    const record = page.getByRole('region', {name: 'Record over time'});
    const activity = record.getByTestId('activity-chart');
    await expect(activity.getByRole('img')).toHaveAttribute(
      'aria-label',
      /Jobs closed per week: 3 settled and 1 refunded in the last 52 weeks/,
    );
    await activity.getByText('The figures as a table').click();
    const weeks = activity.getByRole('table', {name: /Jobs closed per week/});
    // A header and the three weeks something happened in; empty weeks are left out.
    await expect(weeks.getByRole('row')).toHaveCount(4);
    await expect(weeks).toContainText('2 under 1, 1 of 1–10');

    const rating = record.getByTestId('score-chart');
    await expect(rating.getByRole('img')).toHaveAttribute('aria-label', /Rating over time: 2 points/);
    await rating.getByText('The figures as a table').click();
    // Weighted by the number of reviews: (4·2 + 5·1) / 3 = 4.3.
    await expect(rating.getByRole('table')).toContainText('4.3');
  });

  test('an agent with nothing closed says so instead of drawing an empty chart', async ({page}) => {
    await page.goto('/agents/2');
    const record = page.getByRole('region', {name: 'Record over time'});
    await expect(record).toContainText('No jobs closed and no reviews shown in the last 52 weeks');
    await expect(record.getByTestId('activity-chart')).toHaveCount(0);
  });

  test('the record says it is loading, and says so plainly when it cannot be read', async ({page}) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/v1/agents/1/history', async (route) => {
      await held;
      await route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: '{"code":"INTERNAL"}',
      });
    });
    await page.goto('/agents/1');
    const record = page.getByRole('region', {name: 'Record over time'});
    await expect(record.getByRole('status', {name: 'Loading the record over time'})).toBeVisible();
    release();
    await expect(record).toContainText('The record over time could not be loaded');
    // The rest of the page does not depend on it.
    await expect(page.getByRole('heading', {name: 'What this score is made of'})).toBeVisible();
  });

  test('a person’s profile reads its charts from the history route', async ({page}) => {
    const asked = page.waitForRequest((r) =>
      r.url().endsWith('/v1/profiles/dddddddd-0000-4000-8000-000000000001/history'),
    );
    await page.goto('/people/dddddddd-0000-4000-8000-000000000001');
    await asked;
    await expect(page.getByTestId('activity-chart').getByRole('img')).toHaveAttribute(
      'aria-label',
      /Jobs closed per week: 3 settled and 1 refunded/,
    );
    await expect(page.getByTestId('score-chart').getByRole('img')).toHaveAttribute(
      'aria-label',
      /Rating over time: 2 points, running average now 4.5/,
    );
  });
});
