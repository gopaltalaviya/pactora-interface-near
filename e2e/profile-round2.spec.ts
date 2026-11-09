import {expect, test} from '@playwright/test';
import {MOCK_API, signInAs} from './helpers';

/**
 * Profiles after the 2026-11-09 round: the editor's skills tags (at most 20),
 * location and the three toggles are saved; a public profile shows the
 * rating over time as an SVG with a table behind it, the skills, "open to
 * work", the task list and hireability. Each test failed on the old build.
 */

test('the editor saves skills, location and the three toggles', async ({page}, info) => {
  const account = `prof2-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  await page.goto('/me#profile');
  const form = page.getByRole('form', {name: 'Public profile'});
  await form.getByLabel('Skills', {exact: true}).fill('Photography, delivery');
  await form.getByLabel('Skills', {exact: true}).press('Enter');
  const tags = form.getByRole('list', {name: 'Your skills'}).getByRole('listitem');
  await expect(tags).toHaveCount(2);
  await expect(tags.first()).toContainText('photography');
  await form.getByRole('button', {name: 'Remove skill delivery'}).click();
  await expect(tags).toHaveCount(1);
  await form.getByLabel('Location', {exact: true}).fill('Pune, Maharashtra');
  await form.getByLabel('Open to work').check();
  await form.getByLabel('Show my task list').check();
  await form.getByLabel('Alert me to matching work').check();
  const put = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/v1/me/profile'));
  await form.getByRole('button', {name: 'Save profile'}).click();
  const body = (await put).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({
    skills: ['photography'],
    location: 'Pune, Maharashtra',
    availability: true,
    showTaskList: true,
    alerts: true,
  });
  await expect(page.getByTestId('profile-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('form', {name: 'Public profile'}).getByLabel('Open to work')).toBeChecked();
});

test('at most 20 skills', async ({page}, info) => {
  const account = `prof20-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  await page.goto('/me#profile');
  const form = page.getByRole('form', {name: 'Public profile'});
  await form
    .getByLabel('Skills', {exact: true})
    .fill(Array.from({length: 25}, (_, i) => `skill${i}`).join(', '));
  await form.getByLabel('Skills', {exact: true}).press('Enter');
  await expect(form.getByRole('list', {name: 'Your skills'}).getByRole('listitem')).toHaveCount(20);
});

test('a public profile shows the rating over time as a chart with a table, skills, open to work and the task list', async ({
  page,
}) => {
  await page.goto('/people/dddddddd-0000-4000-8000-000000000001');
  const chart = page.getByTestId('score-chart');
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /Rating over time: 2 points/);
  await chart.getByText('The figures as a table').click();
  const table = chart.getByRole('table', {name: /Rating over time/});
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table).toContainText('4.5');
  await expect(page.getByText('Open to work').first()).toBeVisible();
  await expect(page.getByRole('list', {name: 'Skills'})).toContainText('shopfronts');
  await expect(page.getByTestId('task-list')).toContainText('1 open job');
  await expect(
    page.getByTestId('task-list').getByRole('link', {name: 'Photograph a shopfront'}),
  ).toHaveAttribute('href', '/jobs/listing/lst-view');

  await page.goto('/people/dddddddd-0000-4000-8000-000000000002');
  await expect(page.getByText('Not hireable yet').first()).toBeVisible();
  await expect(page.getByTestId('score-chart')).toHaveCount(0);
});
