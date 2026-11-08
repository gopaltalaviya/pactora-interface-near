import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';

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
  '/runs',
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
  '/docs/guides',
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
  await page.route(/\/v1\/agents/, () => {
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
