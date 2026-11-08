import {expect, test, type Page} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs} from './helpers';

/**
 * Profiles, the directory and blind two-way reviews (docs/26 F16, F17),
 * against the mock: 23 published profiles, the first ("Priya Photos") with
 * two reviews; JOB(1) is a settled job, olive the client and wade the
 * worker. Tests that write reviews work on a clone of it.
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PRIYA = 'dddddddd-0000-4000-8000-000000000001';

async function freshJob(page: Page, template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/job/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

const cards = (page: Page) => page.getByRole('list', {name: 'Profiles'}).getByRole('listitem');

test('the directory pages by 20, searches, filters by kind and sorts', async ({page}) => {
  await page.goto('/people');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('People and agents');
  await expect(page.getByTestId('dir-total')).toHaveText('23 listed');
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole('button', {name: 'Next'}).click();
  await expect(page.getByTestId('dir-page')).toHaveText('Page 2 of 2');
  await expect(cards(page)).toHaveCount(3);

  await page.getByLabel('Name or headline').fill('priya');
  await page
    .getByRole('search', {name: 'Search the directory'})
    .getByRole('button', {name: 'Search'})
    .click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('4.5 out of 5 from 2 reviews');
  await expect(cards(page).first()).toContainText('3 settled jobs');

  await page.getByLabel('Name or headline').fill('');
  await page
    .getByRole('search', {name: 'Search the directory'})
    .getByRole('button', {name: 'Search'})
    .click();
  await page.getByLabel('Who').selectOption('person');
  await expect(cards(page)).toHaveCount(2);
  await page.getByLabel('Sort').selectOption('name');
  await expect(cards(page).first()).toContainText('Priya Photos');

  await cards(page).first().getByRole('link', {name: 'Priya Photos'}).click();
  await expect(page).toHaveURL(new RegExp(`/people/${PRIYA}$`));
});

test('a profile shows what its owner chose, its rating and its reviews, as text', async ({page}) => {
  await page.goto(`/people/${PRIYA}`);
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Priya Photos');
  await expect(page).toHaveTitle(/Priya Photos/);
  await expect(page.getByTestId('profile-rating')).toContainText('4.5 out of 5 from 2 reviews');
  await expect(page.getByTestId('profile-account')).toHaveText('priya.testnet');
  // The bio is the owner's words: markup in it is shown, not rendered.
  await expect(page.getByText('<b>not bold</b>')).toBeVisible();
  const reviews = page.getByRole('list', {name: 'Reviews'}).getByRole('listitem');
  await expect(reviews).toHaveCount(2);
  await expect(reviews.first()).toContainText('Olive');
  await expect(reviews.nth(1)).toContainText('A client');
  await expect(reviews.first()).toContainText('5 out of 5');
});

test('an agent profile links to its marketplace page; an unknown or malformed id is not found', async ({
  page,
}) => {
  await page.goto('/people/dddddddd-0000-4000-8000-000000000005');
  await expect(page.getByRole('link', {name: /marketplace page/})).toHaveAttribute('href', '/agents/4');
  await expect(page.getByTestId('profile-account')).toHaveCount(0);

  await page.goto('/people/dddddddd-0000-4000-8000-000000009999');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Profile not found');
  const res = await page.goto('/people/not-a-uuid');
  expect(res?.status()).toBe(404);
});

test('my profile: validated, saved unpublished, then published with a link to it', async ({page}, info) => {
  const account = `pat-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  await page.goto('/me');
  const form = page.getByRole('form', {name: 'Public profile'});
  await expect(form.getByLabel('Display name', {exact: true})).toHaveValue('Pat');
  await form.getByLabel('Display name', {exact: true}).fill('   ');
  await form.getByRole('button', {name: 'Save profile'}).click();
  await expect(form.getByRole('alert')).toContainText('display name');

  await form.getByLabel('Display name', {exact: true}).fill('Wade Writes');
  await form.getByLabel('Headline').fill('Copy and captions');
  await form.getByRole('button', {name: 'Save profile'}).click();
  await expect(page.getByTestId('profile-saved')).toContainText('not public until you publish');

  await form.getByLabel('Publish: list me in the directory').check();
  await form.getByRole('button', {name: 'Save profile'}).click();
  await expect(page.getByTestId('profile-saved')).toContainText('Saved and published');
  await expect(page.getByTestId('profile-saved').getByRole('link', {name: 'View it'})).toHaveAttribute(
    'href',
    /^\/people\/[0-9a-f-]{36}$/,
  );
});

test('after a settled job, the client reviews the worker, and sees theirs once both are in', async ({
  page,
}) => {
  const id = await freshJob(page, JOB(1));
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Review the worker'});
  await expect(card).toBeVisible();
  await expect(card.getByTestId('their-review')).toHaveText('The worker has not reviewed you yet.');

  await card.getByRole('button', {name: 'Send review'}).click();
  await expect(card.getByRole('alert')).toContainText('rating from 1 to 5');
  await card.getByLabel('Rating').selectOption('5');
  await card.getByLabel('How it went').fill('Sharp photos, delivered early.');
  await card.getByRole('button', {name: 'Send review'}).click();
  await expect(card.getByTestId('my-review')).toContainText('Sharp photos, delivered early.');

  // The worker reviews too (from their own browser); both are now revealed.
  expect((await page.request.post(`${MOCK_API}/__test/job/${id}/their-review/worker`)).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole('region', {name: 'Review the worker'}).getByTestId('their-review'),
  ).toContainText('Clear brief, slow to reply.');
});

test('blind: a review the other side wrote first is not shown until you write yours', async ({page}) => {
  const id = await freshJob(page, JOB(1));
  expect((await page.request.post(`${MOCK_API}/__test/job/${id}/their-review/client`)).ok()).toBe(true);
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Review the client'});
  await expect(card.getByTestId('their-review')).toHaveText(
    'The client has reviewed you. You will see it once you have written yours.',
  );
  await expect(page.getByText('Clear brief, slow to reply.')).toHaveCount(0);
});

test('no review card on a job that has not settled, or for someone not on it', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(2)}`);
  await expect(page.getByTestId('state-plain')).toBeVisible();
  await expect(page.getByRole('region', {name: /Review the/})).toHaveCount(0);

  const other = await page.context().browser()!.newPage();
  await signInAs(other, 'nora.testnet');
  await other.goto(`/jobs/${JOB(1)}`);
  await expect(other.getByTestId('not-a-party')).toBeVisible();
  await expect(other.getByRole('region', {name: /Review the/})).toHaveCount(0);
  await other.close();
});

test('the directory and a profile pass an accessibility scan', async ({page}) => {
  await page.goto('/people');
  await expect(cards(page)).toHaveCount(20);
  await expectNoBlockingViolations(page, 'directory');
  await page.goto(`/people/${PRIYA}`);
  await expect(page.getByRole('list', {name: 'Reviews'})).toBeVisible();
  await expectNoBlockingViolations(page, 'profile');
});
