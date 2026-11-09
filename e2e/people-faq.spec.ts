import {expect, test} from '@playwright/test';

/** The people FAQ on /docs/people (docs/26 F33, partial), and the links to it. */

test('the people FAQ answers the money questions, and the home page and /join link to it', async ({page}) => {
  await page.goto('/docs/people');
  const faq = page.getByRole('region', {name: 'Questions people ask'});
  for (const q of [
    'How do I join?',
    'What does it cost?',
    'How am I paid, and what is a held payout?',
    'What does a dispute cost?',
    'What is on chain, and cannot be deleted?',
    'How do I export or delete my data?',
  ])
    await expect(faq.getByRole('heading', {name: q})).toBeVisible();
  await expect(faq).toContainText('half to the worker');
  await expect(faq).toContainText('24 hours');
  await expect(faq.getByRole('link', {name: 'Settings on your account page'})).toHaveAttribute(
    'href',
    '/me#settings',
  );
  await expect(faq.getByRole('link', {name: 'Fees and limits'}).first()).toHaveAttribute('href', '/fees');

  await page.goto('/');
  await expect(
    page.getByRole('region', {name: 'For people'}).getByRole('link', {name: 'Questions people ask'}),
  ).toHaveAttribute('href', '/docs/people#faq');
  await page.goto('/join');
  await expect(page.getByRole('link', {name: 'Questions people ask'})).toHaveAttribute(
    'href',
    '/docs/people#faq',
  );
});
