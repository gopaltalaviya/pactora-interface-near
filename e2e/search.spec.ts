import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

/** The ⌘K / Ctrl+K palette: built from the real docs pages, so these run against the production build. */

const box = (page: Page) => page.getByRole('combobox', {name: 'Search the docs, pages and agents'});
const options = (page: Page) => page.getByRole('listbox', {name: 'Results'}).getByRole('option');

async function openWithKeys(page: Page, path = '/') {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  await expect(box(page)).toBeFocused();
}

test('Ctrl+K opens the palette; a typo still finds the right docs section; Enter goes to its anchor', async ({
  page,
}) => {
  await openWithKeys(page);
  await box(page).fill('dipsute timeout');
  const first = options(page).first();
  await expect(first).toContainText('How it works');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/docs\/concepts#/);
  await expect(box(page)).toHaveCount(0);
});

test('identifiers are searchable by the word inside them (expireDispute → "dispute")', async ({page}) => {
  await openWithKeys(page);
  await box(page).fill('expire dispute');
  await expect(options(page).first()).toContainText(/How it works|Security model/);
});

test('"/" opens it on docs pages, and Escape closes it and returns focus', async ({page, isMobile}) => {
  test.skip(isMobile, 'a keyboard shortcut; phones open search from the header button (tested below)');
  await page.goto('/docs/api');
  await page.waitForLoadState('networkidle');
  const trigger = page.getByRole('button', {name: /Search docs/});
  await trigger.focus();
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('live agents, pages and actions are in the same results', async ({page}) => {
  await openWithKeys(page);
  await box(page).fill('research');
  await expect(page.getByRole('group', {name: 'Agents'}).getByRole('option').first()).toContainText(
    'ResearchBot',
  );
  await box(page).fill('uptime');
  await expect(options(page).first()).toContainText(/system status/i);
  await box(page).fill('register');
  await expect(page.getByRole('group', {name: 'Actions'})).toContainText('Register your agent');
});

test('arrow keys move the selection, and the input announces it (aria-activedescendant)', async ({page}) => {
  await openWithKeys(page);
  await box(page).fill('escrow');
  await expect(options(page).nth(1)).toBeVisible();
  const firstId = await options(page).nth(0).getAttribute('id');
  const secondId = await options(page).nth(1).getAttribute('id');
  await expect(box(page)).toHaveAttribute('aria-activedescendant', firstId!);
  await page.keyboard.press('ArrowDown');
  await expect(box(page)).toHaveAttribute('aria-activedescendant', secondId!);
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('no results says so and offers a way on; hostile input is inert', async ({page}) => {
  await openWithKeys(page);
  await box(page).fill('zzqqxx');
  await expect(page.getByText(/No results for/)).toBeVisible();
  await box(page).fill('<img src=x onerror=alert(1)> .*(?<=x)[$^');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await box(page).fill('x'.repeat(5000));
  expect((await box(page).inputValue()).length).toBeLessThanOrEqual(200);
});

test('a chosen result is remembered as a recent search', async ({page}) => {
  await openWithKeys(page);
  await box(page).fill('quickstart');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/docs\/quickstart/);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('group', {name: 'Recent'})).toContainText(/quickstart/i);
});

test('the open palette passes an axe audit', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openWithKeys(page, '/docs');
  await box(page).fill('escrow');
  await expect(options(page).first()).toBeVisible();
  const {violations} = await new AxeBuilder({page})
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('on a phone it is full screen with a Cancel button', async ({page}) => {
  await page.setViewportSize({width: 375, height: 760});
  await page.goto('/docs');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', {name: 'Search', exact: true}).click();
  await expect(box(page)).toBeVisible();
  const dialog = await page.getByRole('dialog', {name: 'Search Pactora'}).boundingBox();
  expect(dialog!.width).toBeGreaterThanOrEqual(370);
  await page.getByRole('button', {name: 'Cancel'}).click();
  await expect(box(page)).toHaveCount(0);
});
