import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {
  chainCredentials,
  credentialToken,
  expectNoBlockingViolations,
  MOCK_API,
  quietChain,
  signInAs,
  withCredentials,
} from './helpers';

const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
/** A listing and a job the mock API serves, for a visitor who is not signed in. */
const LISTING_ID = 'lst-view';
// JOB(1) of the mock (e2e/mock-api.mjs): a job it serves, so the scan sees a real job page, not "not found".
const JOB_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

/**
 * Every page through axe-core's WCAG 2.1 A/AA rules: contrast, names and
 * labels, ARIA use, landmarks, headings. A serious or critical violation
 * fails the build; the rest are reported so they are seen.
 *
 * Sections that fade in on scroll are forced visible first (reduced motion),
 * so axe measures their real colours rather than a half-faded frame.
 */
const PAGES = [
  '/',
  '/demo',
  '/agents',
  '/agents/1',
  '/register',
  '/signin',
  '/join',
  '/jobs',
  '/jobs/new',
  '/me',
  `/jobs/listing/${LISTING_ID}`,
  `/jobs/${JOB_ID}`,
  '/runs',
  '/receipts',
  '/swarm',
  `/runs/${RUN_ID}`,
  '/status',
  '/about',
  '/fees',
  '/risks',
  '/contact',
  '/terms',
  '/privacy',
  '/docs',
  '/docs/quickstart',
  '/docs/concepts',
  '/docs/build-an-agent',
  '/docs/mcp',
  '/docs/api',
  '/docs/security',
  '/docs/faq',
];

for (const path of PAGES) {
  test(`accessibility: ${path}`, async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const {violations} = await new AxeBuilder({page})
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const summary = violations.map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`,
    );
    if (summary.length) console.warn(`${path}\n  ${summary.join('\n  ')}`);
    expect(blocking, summary.join('\n')).toEqual([]);
  });
}

/**
 * The same rules while the data is still loading. The landing page's figures
 * showed a skeleton with `aria-label` on a role-less span (aria-prohibited-attr)
 * — invisible to the test above whenever the API answered before axe ran, and
 * caught only when a stale build pointed the site at a dead API. Here the API
 * is held, so the loading state is what gets scanned.
 */
test('accessibility: / while the data is still loading', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.route(/\/v1\/(agents|stats)/, () => {
    // Never answered: the figures stay in their loading state.
  });
  await page.goto('/');
  await expect(page.locator('dd .skeleton').first()).toBeAttached();
  const {violations} = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
});

/**
 * Work credentials (feature/work-credentials): the job page's card, claimed,
 * and the list on an agent page, on a network that has the contract. Both
 * are hidden on the default mock network, so the loop above never sees them.
 */
test('accessibility: a claimed work credential on the job page', async ({page}) => {
  await quietChain(page);
  const res = await page.request.post(`${MOCK_API}/__test/clone/job/${JOB_ID}`);
  const id = ((await res.json()) as {id: string}).id;
  await withCredentials(page);
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  const card = page.getByRole('region', {name: 'Work credential'});
  await expectNoBlockingViolations(page, 'job page, credential to claim');
  await card.getByRole('button', {name: 'Claim your work credential'}).click();
  await expect(card.getByTestId('credential-minted')).toBeVisible();
  await expectNoBlockingViolations(page, 'job page, credential claimed');
});

test('accessibility: the work credentials list on an agent page', async ({page}) => {
  await quietChain(page);
  await withCredentials(page);
  await chainCredentials(page, {
    'researchbot.owner.testnet': [
      credentialToken('researchbot.owner.testnet', '5000', '20000', '2026-11-10T09:00:00.000Z'),
    ],
  });
  await page.goto('/agents/1');
  await expect(page.getByRole('region', {name: 'Work credentials'}).getByRole('listitem')).toHaveCount(1);
  await expectNoBlockingViolations(page, '/agents/1 with work credentials');
});
