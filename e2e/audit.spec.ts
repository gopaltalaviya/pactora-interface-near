import {expect, test, type Page} from '@playwright/test';
import {installWallet, MOCK_API, signInAs, txs} from './helpers';

/**
 * The UI audit of 2026-11-09, one test per finding. Each test failed on the
 * code before its fix (the red run is recorded in the commit message), so a
 * regression shows up as the same failure, not as a green that proves nothing.
 *
 *   H2 the early-input script keeps nothing after hydration, and no password;
 *   H3 the header fits on one line at every desktop width;
 *   M4 a draft awaiting the client's review is said so;
 *   M5 a revision or a dispute needs a confirming click;
 *   M6 sign-in comes back to where it started (only to a path on this site);
 *   M7 what the wallet will sign, and for how much, is said before it opens;
 *   M8 the register button lists what is missing;
 *   M9 refusals read as sentences, a 404 has a way back and no Retry;
 *   M10 the network badge keeps a visible word on a phone;
 *   M11 focus follows a route change and an opened form;
 *   L1–L8 confirmations, labels, the mobile menu, tap targets, a placeholder.
 */

const JOB = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fresh(page: Page, kind: 'listing' | 'job', template: string): Promise<string> {
  const res = await page.request.post(`${MOCK_API}/__test/clone/${kind}/${template}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as {id: string}).id;
}

/**
 * The desktop header's visible links and buttons whose text sits on more than
 * one line, or that stand taller than one row. (Scroll overflow is not the
 * measure: the active link's underline is drawn 17px below it on purpose.)
 */
const wrappedInHeader = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('header a, header button')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => {
        let lines = 1;
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const parent = n.parentElement;
          // Visually hidden text (sr-only, 1px wide) wraps by design.
          if (!n.textContent?.trim() || !parent || parent.getBoundingClientRect().width <= 2) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const tops = [...range.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top));
          lines = Math.max(lines, new Set(tops).size);
        }
        return {
          text: (e.textContent ?? '').trim().slice(0, 30),
          height: Math.round(e.getBoundingClientRect().height),
          lines,
        };
      })
      .filter((x) => x.height > 40 || x.lines > 1),
  );

const early = (page: Page) =>
  page.evaluate(() => (window as unknown as {__pactoraEarly?: Record<string, string>}).__pactoraEarly);

// ── H2 ───────────────────────────────────────────────────────────────────────

test('H2: typing after hydration is not recorded by the early-input script, least of all an API key', async ({
  page,
}) => {
  await page.goto('/runs');
  await page.waitForLoadState('networkidle');
  const key = page.getByLabel('Orchestrator API key');
  await key.click();
  await page.keyboard.type('ak_typed_after_hydration');
  await expect(key).toHaveValue('ak_typed_after_hydration');
  const afterKey = await early(page);
  expect(afterKey === undefined || Object.keys(afterKey).length === 0, JSON.stringify(afterKey)).toBe(true);

  // A plain text field, too: once React owns the inputs the script has no job left.
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Name').fill('ResearchBot');
  const afterName = await early(page);
  expect(afterName === undefined || Object.keys(afterName).length === 0, JSON.stringify(afterName)).toBe(
    true,
  );
});

// ── H3 ───────────────────────────────────────────────────────────────────────

for (const width of [1024, 1280, 1440]) {
  for (const signed of [false, true]) {
    test(`H3: the header fits one row at ${width}px, ${signed ? 'signed in' : 'signed out'}`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'a phone folds the links into the menu');
      await page.setViewportSize({width, height: 800});
      if (signed) await signInAs(page, 'olive.testnet');
      // The demo page: its link is the active one, with the underline.
      await page.goto('/demo');
      await page.waitForLoadState('networkidle');
      expect(await wrappedInHeader(page)).toEqual([]);
      const banner = page.getByRole('banner');
      // From lg (1024px) the links are in the bar; Firefox counts its scrollbar out of the width, so at
      // 1024 it may show the menu button instead — either way nothing wraps or overflows.
      await expect(
        banner.getByRole('link', {name: 'Demo'}).or(banner.getByRole('button', {name: 'Open menu'})),
      ).toBeVisible();
      // The register button has a row of its own only from 1280 (xl); below
      // that it lives in the hero, the footer and the phone menu. Checked
      // above the breakpoint: Firefox counts its scrollbar out of 1280.
      if (width > 1280) {
        const cta = banner.getByRole('link', {name: 'Register an agent'});
        await expect(cta).toBeVisible();
        expect((await cta.boundingBox())!.height).toBeLessThanOrEqual(40);
      }
      if (!signed) await expect(banner.getByRole('link', {name: 'Sign in'})).toBeVisible();
      // Nothing pushed past the right edge.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
    });
  }
}

// ── M4 ───────────────────────────────────────────────────────────────────────

test('M4: a client whose draft awaits review is told to review it, not that there is nothing to do', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(42)}`);
  await expect(page.getByTestId('no-action')).toContainText('Review the draft below');
  await expect(page.getByTestId('no-action')).not.toContainText('nothing for you to do');
});

// ── M5 ───────────────────────────────────────────────────────────────────────

test('M5: a revision and a dispute each need a confirming click that names the consequence', async ({
  page,
}) => {
  const id = await fresh(page, 'job', JOB(42));
  await signInAs(page, 'olive.testnet');
  let reviews = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/review$/.test(new URL(r.url()).pathname)) reviews++;
  });
  await page.goto(`/jobs/${id}`);
  const review = page.getByRole('form', {name: 'Review of draft 1'});
  // Before a decision the hint speaks of the approval the reason would travel with.
  await expect(review.getByText(/with your approval/)).toBeVisible();
  await review.getByLabel('Your reason').fill('The second sign cannot be read. Please retake it.');

  await review.getByRole('button', {name: 'Ask for a revision (3 left)'}).click();
  const confirmRevision = review.getByRole('button', {name: 'Confirm revision'});
  await expect(confirmRevision).toBeVisible();
  await expect(review).toContainText('uses 1 of 3 revisions');
  await expect(review.getByText(/with your approval/)).toHaveCount(0);
  expect(reviews).toBe(0);
  await expect(page.getByTestId('draft-phase')).toContainText('waiting for the client');

  // Changed my mind: back to the three choices, nothing sent.
  await review.getByRole('button', {name: 'Keep reviewing'}).click();
  await expect(confirmRevision).toHaveCount(0);
  await review.getByRole('button', {name: 'I will dispute'}).click();
  const confirmDispute = review.getByRole('button', {name: 'Confirm dispute'});
  await expect(confirmDispute).toBeVisible();
  await expect(review).toContainText(/bond/);
  await expect(review.getByText(/with your approval/)).toHaveCount(0);
  expect(reviews).toBe(0);

  await confirmDispute.click();
  await expect(page.getByTestId('draft-phase')).toContainText('will dispute');
  expect(reviews).toBe(1);
});

// ── M6 ───────────────────────────────────────────────────────────────────────

test('M6: signing in from a job, a listing or /join comes back to that page', async ({page}) => {
  await page.goto('/jobs/listing/lst-view');
  await expect(page.getByRole('main').getByRole('link', {name: 'Sign in'})).toHaveAttribute(
    'href',
    '/signin?next=%2Fjobs%2Flisting%2Flst-view',
  );
  await page.goto('/join');
  await expect(page.getByRole('main').getByRole('link', {name: 'Sign in'})).toHaveAttribute(
    'href',
    '/signin?next=%2Fjoin',
  );

  // The scripted wallet is an init script: it must be in place before the page load it rides on.
  await installWallet(page, 'wade.testnet');
  await page.goto(`/jobs/${JOB(15)}`);
  const link = page.getByText('Are you the client or the worker?').getByRole('link', {name: 'Sign in'});
  await expect(link).toHaveAttribute('href', `/signin?next=${encodeURIComponent(`/jobs/${JOB(15)}`)}`);
  await link.click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page).toHaveURL(`/jobs/${JOB(15)}`);
  await expect(page.getByTestId('no-action')).toContainText('You are the worker');
});

test('M6: a next that would leave the site is ignored', async ({page}) => {
  await installWallet(page, 'wade.testnet');
  for (const bad of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'jobs']) {
    await page.goto(`/signin?next=${encodeURIComponent(bad)}`);
    await page.getByRole('button', {name: 'Connect and sign in'}).click();
    await expect(page.getByTestId('signed-in-account')).toHaveText('wade.testnet');
    await expect(page).toHaveURL(/\/signin/);
    await page.getByRole('button', {name: 'Sign out', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Connect and sign in'})).toBeVisible();
  }
});

// ── M7 ───────────────────────────────────────────────────────────────────────

test('M7: approve and dispute say what will be signed, on which contract, for how much', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(5)}`);
  await expect(page.getByTestId('will-sign-approve')).toContainText(
    'You will sign: approve on pactora.testnet: 4 USDC',
  );
  await page.getByRole('button', {name: 'Dispute the result'}).click();
  await expect(page.getByTestId('will-sign-dispute')).toContainText(
    'You will sign: dispute on pactora.testnet: 4 USDC stays in escrow; your bond is 0.4 USDC',
  );
  expect(await txs(page)).toHaveLength(0);
});

test('M7: funding a selected bid says the method, the contract and the amount before the wallet opens', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-own-fund')}`);
  await page.getByRole('button', {name: 'Select Nora'}).click();
  await page.getByLabel(/^Why/).fill('Closest to the shop and the best price.');
  await page.getByRole('button', {name: 'Confirm selection'}).click();
  await expect(page.getByRole('heading', {name: 'Fund the job'})).toBeVisible();
  await expect(page.getByTestId('will-sign-create')).toContainText(
    'You will sign: create_job on pactora.testnet: 3 USDC',
  );
  expect(await txs(page)).toHaveLength(0);
});

// ── M8 ───────────────────────────────────────────────────────────────────────

test('M8: the disabled Register button lists what is missing, and the transaction count follows the first funding', async ({
  page,
}) => {
  await page.goto('/register');
  const button = page.getByRole('button', {name: 'Register', exact: true});
  await expect(button).toBeDisabled();
  const ids = ((await button.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
  const described = (await Promise.all(ids.map((id) => page.locator(`#${id}`).textContent()))).join(' ');
  expect(described).toMatch(/Connect a wallet/);
  expect(described).toMatch(/name/i);
  await page.getByLabel('Name').fill('ResearchBot');
  const after = (await Promise.all(ids.map((id) => page.locator(`#${id}`).textContent()))).join(' ');
  expect(after).toMatch(/Connect a wallet/);
  expect(after).not.toMatch(/Give the agent a name/);

  await expect(page.getByText(/two transactions/)).toBeVisible();
  await page.getByLabel('First funding (optional)').fill('5');
  await expect(page.getByText(/three transactions/)).toBeVisible();
  await expect(page.getByText(/two transactions/)).toHaveCount(0);
});

// ── M9 ───────────────────────────────────────────────────────────────────────

test('M9: a job that does not exist says so in words, with a way back and without Retry', async ({page}) => {
  await page.goto(`/jobs/${JOB(999)}`);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', {level: 1})).toContainText(/not found/i);
  await expect(main.getByText(/NOT_FOUND/)).toHaveCount(0);
  await expect(main.getByRole('button', {name: 'Retry'})).toHaveCount(0);
  // Signed out, the way back is the public board, not an account page.
  await expect(main.getByRole('link', {name: 'Jobs'})).toHaveAttribute('href', '/jobs');
});

test('M9: a job the API cannot serve offers Retry; a refusal reads as a sentence, not a code', async ({
  page,
}) => {
  await page.route(/\/v1\/jobs\/aaaaaaaa-0000-4000-8000-000000000001$/, (route) => route.abort());
  await page.goto(`/jobs/${JOB(1)}`);
  await expect(page.getByRole('main').getByRole('button', {name: 'Retry'})).toBeVisible();

  await signInAs(page, 'nora.testnet');
  await page.goto('/admin');
  await expect(page.getByText('You do not have access to this page.')).toBeVisible();
  await expect(page.getByText(/FORBIDDEN/)).toHaveCount(0);
});

// ── M10 ──────────────────────────────────────────────────────────────────────

test('M10: the network badge keeps a visible word at 390px', async ({page}) => {
  await page.setViewportSize({width: 390, height: 800});
  await page.goto('/');
  const badge = page.getByRole('banner').getByTestId('network-badge');
  await expect(badge).toContainText(/Testnet/);
  const label = badge.locator('span', {hasText: /Testnet/}).last();
  await expect(label).toBeVisible();
  expect((await label.boundingBox())!.width).toBeGreaterThan(20);
});

// ── M11 ──────────────────────────────────────────────────────────────────────

test('M11: after a keyboard navigation, focus moves into the new page, not the link left behind', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the desktop nav is in a menu on a phone');
  await page.goto('/');
  const jobs = page
    .getByRole('banner')
    .getByRole('navigation', {name: 'Main'})
    .getByRole('link', {name: 'Jobs'});
  await jobs.first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/jobs');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Work on offer');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a ? `${a.tagName}:${a.id}:${(a.textContent ?? '').trim().slice(0, 20)}` : 'none';
      }),
    )
    .toMatch(/^(MAIN:main|H1)/);
});

test('M11: the dispute form takes focus when it opens, and the field with the problem takes it back', async ({
  page,
}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(6)}`);
  await page.getByRole('button', {name: 'Dispute the result'}).click();
  const reason = page.getByLabel('Why is the result not acceptable?');
  await expect(reason).toBeFocused();
  await reason.fill('bad');
  await page.getByRole('button', {name: 'Sign and dispute'}).click();
  await expect(page.getByText('The reason is at least 10 characters (now 3).')).toBeVisible();
  await expect(reason).toBeFocused();
  expect(await txs(page)).toHaveLength(0);
});

// ── low ──────────────────────────────────────────────────────────────────────

test('L1: withdrawing a bid asks once more before it goes', async ({page}) => {
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/listing/${await fresh(page, 'listing', 'lst-withdraw')}`);
  const bid = page.getByTestId('my-bid');
  await bid.getByRole('button', {name: 'Withdraw this bid'}).click();
  await expect(bid).toContainText('pending');
  await bid.getByRole('button', {name: 'Keep it'}).click();
  await expect(bid.getByRole('button', {name: 'Confirm withdrawal'})).toHaveCount(0);
  await bid.getByRole('button', {name: 'Withdraw this bid'}).click();
  await bid.getByRole('button', {name: 'Confirm withdrawal'}).click();
  await expect(bid).toContainText('withdrawn');
});

test('L2: withdrawing an evidence photo asks once more before it goes', async ({page}) => {
  const id = await fresh(page, 'job', JOB(40));
  await signInAs(page, 'wade.testnet');
  await page.goto(`/jobs/${id}`);
  await page.getByLabel('Add a photo').setInputFiles({
    name: 'a.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
      'base64',
    ),
  });
  const photo = page.getByRole('list', {name: 'Photos'}).getByRole('listitem').first();
  await photo.getByRole('button', {name: 'Withdraw'}).click();
  await expect(photo).toContainText('in use');
  await photo.getByRole('button', {name: 'Confirm withdrawal'}).click();
  await expect(photo).toContainText('withdrawn');
});

test('L3: a council member’s Reject vote asks once more before the wallet opens', async ({page}, info) => {
  const who = `cara-audit-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}.testnet`;
  await signInAs(page, who);
  await page.goto('/admin');
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  await page.getByRole('button', {name: 'Propose: pay the worker'}).click();
  await expect(page.getByTestId('desk-notice')).toContainText('Pay the worker');
  expect(await txs(page)).toHaveLength(1);
  const proposal = page.getByRole('list', {name: 'Proposals'}).getByRole('listitem').last();
  await proposal.getByRole('button', {name: 'Reject', exact: true}).click();
  await expect(proposal.getByRole('button', {name: 'Confirm the Reject vote'})).toBeVisible();
  expect(await txs(page)).toHaveLength(1);
  await proposal.getByRole('button', {name: 'Confirm the Reject vote'}).click();
  await expect(page.getByTestId('desk-notice')).toContainText('Vote sent');
  const vote = (await txs(page)).at(-1)!;
  expect(vote.actions[0]!.params.methodName).toBe('act_proposal');
  expect(vote.actions[0]!.params.args).toMatchObject({action: 'VoteReject'});
});

test('L4: the account page and the sign-in page call the manage link the same thing', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await expect(page.getByRole('link', {name: 'Fund and stake'})).toBeVisible();
  await page.goto('/me');
  await expect(page.getByRole('main').getByRole('link', {name: 'Fund and stake'})).toBeVisible();
  await expect(page.getByText('Fund, stake and set caps')).toHaveCount(0);
});

test('L5: the phone menu offers Sign in or My account, never both', async ({page}) => {
  await page.setViewportSize({width: 390, height: 800});
  await page.goto('/');
  await page.getByRole('button', {name: 'Open menu'}).click();
  const menu = page.locator('#mobile-nav');
  await expect(menu.getByRole('link', {name: 'Sign in'})).toBeVisible();
  await expect(menu.getByRole('link', {name: 'My account'})).toHaveCount(0);

  await signInAs(page, 'olive.testnet');
  await page.goto('/');
  await page.getByRole('button', {name: 'Open menu'}).click();
  await expect(menu.getByRole('link', {name: 'My account'})).toBeVisible();
  await expect(menu.getByRole('link', {name: 'Sign in'})).toHaveCount(0);
});

test('L7: copy buttons, explorer links and back links are at least 24px tall', async ({page}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const copy = page.getByRole('button', {name: /^Copy /}).first();
  await copy.scrollIntoViewIfNeeded();
  expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  const explorer = page.getByRole('link', {name: /Pactora pactora\.testnet/});
  await explorer.scrollIntoViewIfNeeded();
  expect((await explorer.boundingBox())!.height).toBeGreaterThanOrEqual(24);

  await page.goto('/jobs/new');
  const back = page.getByRole('main').getByRole('link', {name: 'Jobs'});
  // Rounded: a 1.5rem box measures 23.999 under some zoom factors.
  expect(Math.round((await back.boundingBox())!.height)).toBeGreaterThanOrEqual(24);
});

test('L8: the per-criterion evidence field has a short placeholder', async ({page}) => {
  await signInAs(page, 'olive.testnet');
  await page.goto(`/jobs/${JOB(42)}`);
  await expect(page.getByLabel('What shows it (check 1)')).toHaveAttribute(
    'placeholder',
    'Evidence (optional)',
  );
});
