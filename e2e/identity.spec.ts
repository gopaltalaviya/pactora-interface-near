import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs} from './helpers';

/**
 * Identity checks and standing (docs/26 F13, F14) against the mock: any
 * name opens a SIMULATED session; "Abu Abbas" is a strong sanctions match
 * that holds the account. Each test has its own person, named after its
 * browser, so the browsers sharing the mock never share a check.
 */

async function ownPerson(page: Page, info: TestInfo): Promise<string> {
  const account = `pat-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await signInAs(page, account);
  return account;
}

const card = (page: Page) => page.getByRole('region', {name: 'Identity check'});

test('a clean name opens a simulated check, labelled as such, which records the outcome', async ({
  page,
}, info) => {
  await ownPerson(page, info);
  await page.goto('/me');
  await expect(card(page).getByText('Simulated provider')).toBeVisible();
  await expect(card(page).getByTestId('simulated-notice')).toContainText('no document is looked at');
  await expect(card(page).getByTestId('wallet-screening')).toContainText('not available');
  await expect(card(page).getByTestId('standing')).toContainText('Clear');

  await card(page).getByRole('button', {name: 'Start the identity check'}).click();
  await expect(card(page).getByRole('alert')).toContainText('2-200');
  await card(page).getByLabel('Full legal name').fill('Priya Sharma');
  await card(page).getByRole('button', {name: 'Start the identity check'}).click();
  await card(page).getByRole('link', {name: 'Continue to the simulated identity check'}).click();

  await expect(page).toHaveURL(/\/kyc\/simulated\?session=sim_/);
  await expect(page.getByText('Simulated identity check.', {exact: false}).first()).toBeVisible();
  await page.getByRole('button', {name: 'Simulate: document verified'}).click();
  await expect(page.getByTestId('simulated-done')).toContainText('Verified');

  await page.goto('/me');
  await expect(card(page).getByTestId('kyc-status')).toContainText('An identity document was verified');
  await expect(card(page).getByRole('button', {name: 'Start the identity check'})).toHaveCount(0);
});

test('approved without a document is not verified', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/me');
  await card(page).getByLabel('Full legal name').fill('Priya Sharma');
  await card(page).getByRole('button', {name: 'Start the identity check'}).click();
  await card(page).getByRole('link', {name: 'Continue to the simulated identity check'}).click();
  await page.getByRole('button', {name: 'Simulate: approved without a document'}).click();
  await expect(page.getByTestId('simulated-done')).toContainText('Not verified');
});

test('a strong sanctions match puts the account on hold, with no session to continue to', async ({
  page,
}, info) => {
  await ownPerson(page, info);
  await page.goto('/me');
  await card(page).getByLabel('Full legal name').fill('Abu Abbas');
  await card(page).getByRole('button', {name: 'Start the identity check'}).click();
  await expect(card(page).getByTestId('standing')).toContainText('On hold');
  await expect(card(page).getByTestId('kyc-status')).toContainText('a compliance review is needed');
  await expect(card(page).getByRole('link', {name: /simulated identity check/})).toHaveCount(0);
  await expect(card(page).getByRole('button', {name: 'Start the identity check'})).toHaveCount(0);
});

test('the simulated page refuses a malformed session id', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/kyc/simulated?session=../../etc');
  await expect(page.getByText('No such simulated check')).toBeVisible();
  await expect(page.getByRole('button', {name: /Simulate/})).toHaveCount(0);
});

test('the identity card and the simulated page pass an accessibility scan', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/me');
  await expect(card(page)).toBeVisible();
  await expectNoBlockingViolations(page, 'identity card');
  await card(page).getByLabel('Full legal name').fill('Priya Sharma');
  await card(page).getByRole('button', {name: 'Start the identity check'}).click();
  await card(page).getByRole('link', {name: 'Continue to the simulated identity check'}).click();
  await expect(page.getByRole('button', {name: 'Simulate: document verified'})).toBeVisible();
  await expectNoBlockingViolations(page, 'simulated check');
});
