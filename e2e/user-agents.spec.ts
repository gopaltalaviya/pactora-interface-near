import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page, type TestInfo} from '@playwright/test';
import {PUBLIC_ROUTES} from '../lib/site';
import {MOCK_API, quietChain, signInAs} from './helpers';

// Pages that read the chain (an agent's stake, the money panel) get a node that answers, not the internet.
test.beforeEach(async ({page}) => quietChain(page));

/**
 * Every page, in every browser and device the config knows (E2E_ALL_BROWSERS=1
 * for all five), held to the same five rules:
 *
 * 1. no console error and no uncaught page error;
 * 2. no failed same-origin request (network failure or an HTTP error), and no
 *    5xx from the API;
 * 3. nothing wider than the viewport (no sideways scroll on a phone);
 * 4. exactly one h1, and a non-empty <title>;
 * 5. no serious or critical axe violation (WCAG 2.1 A/AA).
 *
 * Reduced motion is emulated before the first navigation, so axe measures
 * real colours rather than a frame halfway through a fade-in.
 */

const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
/** JOB(1) in the mock (a11y.spec.ts's id is not one the mock knows). */
const JOB_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PERSON_ID = 'dddddddd-0000-4000-8000-000000000005';

/** Pages with an id the mock API serves, for a visitor who is not signed in. */
const ID_ROUTES = [
  '/agents/1',
  '/jobs/listing/lst-view',
  `/jobs/${JOB_ID}`,
  `/runs/${RUN_ID}`,
  `/people/${PERSON_ID}`,
];

/** Pages that show more once signed in, as a person the mock knows. */
const PERSON_ROUTES = ['/me', '/notifications', '/jobs', '/jobs/new', '/join', '/register', '/people'];

/** Benign noise, each seen in a real run (smoke.spec.ts explains each). */
const NOISE = [
  /^Failed to fetch RSC payload .* Falling back to browser navigation/,
  /[?&]_rsc=\S* due to access control checks\.$/,
  // WebKit's wording when navigating away cancels a fetch to the API still in
  // flight (seen on iPhone: the header's notifications poll, as the sign-in
  // page gave way to the next). A real CORS refusal would still fail the
  // Chromium and Firefox runs, which word it differently.
  new RegExp(`${new URL(MOCK_API).host.replace(/[.]/g, '[.]')}/\\S* due to access control checks\\.$`),
  // Firefox, when a navigation cancels a self-hosted font still loading: the next page loads it again.
  /downloadable font: download failed .*_next\/static\/media\//,
];

function watch(page: Page, origin: string) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.some((re) => re.test(m.text()))) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!NOISE.some((re) => re.test(e.message))) problems.push(`pageerror: ${e.message}`);
  });
  page.on('requestfailed', (r) => {
    const url = new URL(r.url());
    // A prefetch the browser drops is not a failure of the page, nor is a
    // script load WebKit cancels when the page navigates on (seen on iPhone:
    // "Load request cancelled" for /_next/static chunks). A chunk that is
    // really missing still fails: it answers 404, caught by `response` below.
    const cancelled =
      r.failure()?.errorText === 'Load request cancelled' ||
      (r.failure()?.errorText === 'NS_BINDING_ABORTED' && url.pathname.startsWith('/_next/static/media/')) ||
      // A <video preload="metadata"> reads the header and the browser aborts
      // the rest of the download: normal media loading, not a failure.
      (r.resourceType() === 'media' && url.pathname.startsWith('/video/'));
    if (url.origin === origin && !url.searchParams.has('_rsc') && !cancelled) {
      problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`);
    }
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    // Any API error is a failure too: the browser logs it only as an
    // anonymous "Failed to load resource", so name the URL here.
    if ((url.origin === origin || url.origin === MOCK_API) && r.status() >= 400) {
      problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url()}`);
    }
  });
  return problems;
}

async function check(page: Page, path: string, problems: string[]) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('h1'), `${path}: exactly one h1`).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  expect((await page.title()).trim(), `${path}: title`).not.toBe('');

  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter((el) => !el.closest('[aria-hidden="true"], .sr-only'))
      .slice(0, 3)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`,
      );
    return {scrollWidth: document.documentElement.scrollWidth, vw, wide};
  });
  expect(
    overflow.scrollWidth,
    `${path}: horizontal overflow ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(overflow.vw);

  const {violations} = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.help} — e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(blocking, `${path}: axe`).toEqual([]);

  expect(problems, `${path}: console and network`).toEqual([]);
}

const account = (prefix: string, info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.repeatEachIndex}-${info.title.length}.testnet`;

for (const path of [...PUBLIC_ROUTES, ...ID_ROUTES]) {
  test(`signed out: ${path}`, async ({page, baseURL}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const problems = watch(page, new URL(baseURL!).origin);
    await check(page, path, problems);
  });
}

for (const path of PERSON_ROUTES) {
  test(`signed in as a person: ${path}`, async ({page, baseURL}, info) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const who = account('ua', info);
    expect((await page.request.post(`${MOCK_API}/__test/person/${who}`)).ok()).toBe(true);
    const problems = watch(page, new URL(baseURL!).origin);
    await signInAs(page, who);
    await check(page, path, problems);
  });
}

test('signed in as an arbiter-council member: /admin', async ({page, baseURL}, info) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const problems = watch(page, new URL(baseURL!).origin);
  await signInAs(page, account('cara', info));
  await check(page, '/admin', problems);
  await expect(page.getByTestId('admin-roles')).toContainText('Arbiter council');
});
