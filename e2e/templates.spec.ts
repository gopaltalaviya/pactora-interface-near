import {expect, test} from '@playwright/test';
import {signInAs} from './helpers';

/** Job templates on /jobs/new (F31): three examples pre-fill the form; "Start from blank" clears it. */

test('a template pre-fills title, description, category, mode, criteria and a price hint; blank clears', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  const templates = page.getByRole('group', {name: 'Start from a template'});
  await expect(templates).toBeVisible();
  await templates.getByRole('button', {name: /Photograph/}).click();
  await expect(page.getByLabel('Title', {exact: true})).not.toHaveValue('');
  await expect(page.getByLabel('Category', {exact: true})).toHaveValue('physical');
  await expect(page.getByLabel('How it is done', {exact: true})).toHaveValue('capture');
  await expect(page.getByLabel('Acceptance criteria')).not.toHaveValue('');
  await expect(page.getByLabel(/Most you pay one worker/)).not.toHaveValue('');
  await expect(page.getByLabel('Skills (optional)')).toHaveValue(/photography/);

  await templates.getByRole('button', {name: /Label a data set/}).click();
  await expect(page.getByLabel('Category', {exact: true})).toHaveValue('judgment');
  await expect(page.getByLabel('How it is done', {exact: true})).toHaveValue('task');

  await templates.getByRole('button', {name: /Deliver|errand/i}).click();
  await expect(page.getByLabel('Title', {exact: true})).toHaveValue(/Deliver|Pick up|errand/i);

  await templates.getByRole('button', {name: 'Start from blank'}).click();
  await expect(page.getByLabel('Title', {exact: true})).toHaveValue('');
  await expect(page.getByLabel('Category', {exact: true})).toHaveValue('');
  await expect(page.getByLabel(/Most you pay one worker/)).toHaveValue('');
});

test('a template is a starting point: the form still validates what was filled in', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/new');
  await page
    .getByRole('group', {name: 'Start from a template'})
    .getByRole('button', {name: /Photograph/})
    .click();
  // The deadline is the person's own to set, so posting straight away is refused there, and only there.
  await page.getByRole('button', {name: 'Post the listing'}).click();
  await expect(page.getByText('Choose a deadline.')).toBeVisible();
  await expect(page.getByText(/The title is at least/)).toHaveCount(0);
});
