import {expect, test} from '@playwright/test';
import {signInAs} from './helpers';

/**
 * Text search (`q`, 2026-11-09): the board and the directory carry it in the
 * URL; /me's jobs filter by status in the URL; the palette finds listings
 * and people. Each test failed on the old build.
 */

test('the board searches on the server and keeps the search in the URL', async ({page}) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/v1/listings') asked.push(u.search);
  });
  await page.goto('/jobs');
  await page.getByRole('searchbox', {name: 'Search'}).fill('"Fits a photographer"');
  await expect(page).toHaveURL(
    /\/jobs\?q=%22Fits\+a\+photographer%22|\/jobs\?q=%22Fits%20a%20photographer%22/,
  );
  await expect(page.getByRole('list', {name: 'Listings'}).getByRole('article')).toHaveCount(1);
  expect(asked.at(-1)).toMatch(/q=%22Fits/);

  await page.goto('/jobs?q=zzznothing');
  await expect(page.getByRole('searchbox', {name: 'Search'})).toHaveValue('zzznothing');
  await expect(page.getByText('No listings match these filters')).toBeVisible();
});

test('the directory keeps its search in the URL and filters to people open to work', async ({page}) => {
  await page.goto('/people?q=Priya');
  await expect(page.getByLabel('Name or headline')).toHaveValue('Priya');
  await expect(page.getByTestId('dir-total')).toHaveText('1 listed');
  await page.getByLabel('Name or headline').fill('');
  await page
    .getByRole('search', {name: 'Search the directory'})
    .getByRole('button', {name: 'Search'})
    .click();
  await page.getByLabel('Open to work only').check();
  await expect(page).toHaveURL(/available=true/);
  await expect(page.getByTestId('dir-total')).toHaveText('1 listed');
  await expect(page.getByRole('list', {name: 'Profiles'})).toContainText('Open to work');
});

test('/me filters jobs by status, in the URL', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto('/me?status=closed#jobs');
  await expect(page.getByLabel('Job status')).toHaveValue('closed');
  const rows = page.getByRole('region', {name: 'My jobs'}).getByTestId('my-job');
  await expect(rows.first()).toBeVisible();
  const labels = await rows.allTextContents();
  for (const text of labels) expect(text).toMatch(/Settled|Refunded/);
  await page.getByLabel('Job status').selectOption('open');
  await expect(page).toHaveURL(/status=open/);
  await expect(rows.first()).toBeVisible();
  const open = await rows.allTextContents();
  for (const text of open) expect(text).not.toMatch(/Settled|Refunded/);
});

test('the palette finds a listing and a person', async ({page}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', {name: 'Search the docs, pages and agents'});
  await expect(box).toBeFocused();
  await box.fill('shopfront');
  const options = page.getByRole('listbox', {name: 'Results'}).getByRole('option');
  await expect(options.filter({hasText: 'Photograph a shopfront'}).first()).toBeVisible();
  await box.fill('Priya');
  await expect(options.filter({hasText: 'Priya Photos'}).first()).toBeVisible();
});
