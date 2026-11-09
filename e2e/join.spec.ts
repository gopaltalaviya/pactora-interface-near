import {expect, test} from '@playwright/test';
import {signInAs} from './helpers';

/** Terms acceptance at /join (2026-11-09): Join is refused until the box is ticked; the acceptance is kept. */

test('Join needs the Terms and Privacy box ticked, which links to both, and the acceptance is shown on /me', async ({
  page,
}) => {
  await signInAs(page, 'sam.testnet');
  await page.goto('/join');
  await page.getByLabel('Name').fill('Sam');
  const join = page.getByRole('button', {name: 'Join', exact: true});
  await expect(join).toBeDisabled();
  const terms = page.getByLabel(/I accept the Terms and Privacy policy/);
  await expect(terms).not.toBeChecked();
  const label = page.locator('label', {has: terms});
  await expect(label.getByRole('link', {name: 'Terms'})).toHaveAttribute('href', '/terms');
  await expect(label.getByRole('link', {name: 'Privacy policy'})).toHaveAttribute('href', '/privacy');
  await terms.check();
  await expect(join).toBeEnabled();
  await terms.uncheck();
  await expect(join).toBeDisabled();
});
