import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, MOCK_API, signInAs} from './helpers';

/** Telegram and email linking on /me (docs/26 F11, F12), against the mock. */

async function ownPerson(page: Page, info: TestInfo) {
  const account = `pat-ch-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;
  expect((await page.request.post(`${MOCK_API}/__test/person/${account}`)).ok()).toBe(true);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await signInAs(page, account);
}
const card = (page: Page) => page.getByRole('region', {name: 'Notifications elsewhere'});

test('Telegram: the page shows the code for the bot and the number only it knows', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/me#settings');
  await card(page).getByRole('button', {name: 'Link Telegram'}).click();
  const shown = card(page).getByTestId('telegram-code');
  await expect(shown).toContainText('/link K7M2Q9XP');
  await expect(shown).toContainText('@PactoraTestBot');
  await expect(shown).toContainText('4821');
});

test('email: a wrong code is refused, the right one links, and it can be unlinked', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/me#settings');
  await card(page).getByLabel('Email address').fill('priya@example.com');
  await card(page).getByRole('button', {name: 'Send a code'}).click();
  await card(page)
    .getByLabel(/The 6-digit code sent to p\*\*\*@example\.com/)
    .fill('111111');
  await card(page).getByRole('button', {name: 'Confirm'}).click();
  await expect(card(page).getByRole('alert')).toContainText('not the code');
  await card(page)
    .getByLabel(/The 6-digit code sent to/)
    .fill('246810');
  await card(page).getByRole('button', {name: 'Confirm'}).click();
  await expect(card(page).getByTestId('channel-email')).toContainText('Linked (p***@example.com)');
  await card(page).getByTestId('channel-email').getByRole('button', {name: 'Unlink'}).click();
  await expect(card(page).getByLabel('Email address')).toBeVisible();
});

test('the channels card passes an accessibility scan', async ({page}, info) => {
  await ownPerson(page, info);
  await page.goto('/me#settings');
  await card(page).getByRole('button', {name: 'Link Telegram'}).click();
  await expect(card(page).getByTestId('telegram-code')).toBeVisible();
  await expectNoBlockingViolations(page, 'channels card');
});
