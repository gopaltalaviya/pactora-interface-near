import {expect, test, type Page} from '@playwright/test';

const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';

/** Collect console errors — a CSP violation surfaces only as one of these. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Next.js logs this when a link prefetch is cancelled by navigating away —
    // Firefox reports the cancelled fetch as an error where Chrome reports an
    // abort. Next falls back to a normal navigation; nothing is wrong.
    if (/^Failed to fetch RSC payload .* Falling back to browser navigation/.test(m.text())) return;
    // WebKit's wording for the same cancelled prefetch (seen 1 run in 6 under
    // parallel load; 5/5 clean alone): "…?_rsc=… due to access control
    // checks." Only RSC payload URLs — a CSP violation reads "Refused to…".
    if (/[?&]_rsc=\S* due to access control checks\.$/.test(m.text())) return;
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => {
    // WebKit can deliver the same cancelled RSC prefetch as a page error.
    if (/[?&]_rsc=\S* due to access control checks\.$/.test(e.message)) return;
    errors.push(e.message);
  });
  return errors;
}

test('the landing page makes its case and leads to the demo and the docs', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1})).toContainText(
    "Where AI agents make deals they can't break",
  );
  await expect(page.getByRole('link', {name: /Watch agents pay each other/})).toHaveAttribute(
    'href',
    '/demo',
  );
  await expect(page.getByRole('link', {name: 'Read the docs'})).toHaveAttribute('href', '/docs');
  // Live figures come from the API, and the deployed escrow links to the explorer.
  await expect(page.getByText('Jobs settled on chain')).toBeVisible();
  await expect(page.getByRole('link', {name: /Pactora pactora\.testnet/})).toHaveAttribute(
    'href',
    'https://testnet.nearblocks.io/address/pactora.testnet',
  );
  // The FAQ opens.
  await page.getByText('Is this real money?').click();
  await expect(page.getByText(/NEAR testnet with a test stablecoin/)).toBeVisible();
});

test('every docs page renders, and the sidebar marks where you are', async ({page, isMobile}) => {
  for (const [path, title] of [
    ['/docs', 'Introduction'],
    ['/docs/quickstart', 'Quickstart'],
    ['/docs/concepts', 'How it works'],
    ['/docs/guides', 'Video guides'],
    ['/docs/build-an-agent', 'Build an agent'],
    ['/docs/mcp', 'MCP server'],
    ['/docs/api', 'HTTP API'],
    ['/docs/security', 'Security model'],
    ['/docs/faq', 'FAQ'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', {level: 1})).toHaveText(title);
    // On a phone the sidebar lives in the collapsed "Docs · …" menu.
    if (isMobile) await page.getByText(`Docs · ${title}`).click();
    await expect(
      page
        .getByRole('navigation', {name: 'Documentation'})
        .first()
        .getByRole('link', {name: title, exact: true}),
    ).toHaveAttribute('aria-current', 'page');
  }
});

test('the demo page renders with labelled inputs and the network badge', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/demo');
  await expect(page.getByRole('heading', {level: 1})).toContainText('One sentence');
  await expect(page.getByLabel('Goal')).toBeVisible();
  await expect(page.getByLabel('Orchestrator API key')).toBeVisible();
  await expect(page.getByTestId('network-badge')).toContainText(/Testnet/);
  expect(errors).toEqual([]);
});

test('the marketplace ranks, filters, and labels an unproven agent', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/agents');
  await expect(page.getByText('ResearchBot')).toBeVisible();
  await expect(page.getByText('unproven — no settled jobs yet')).toBeVisible();

  const quality = page.getByRole('button', {name: 'Quality'});
  await quality.click();
  await expect(quality).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Filter by capability').fill('nothing-offers-this');
  await expect(page.getByText(/No agent matches/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('filtered by a skill, the marketplace shows each agent’s record in that skill', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/agents');
  await page.getByRole('button', {name: 'market-research', exact: true}).click();
  await expect(page.getByText(/ranked on their record in “market-research”/)).toBeVisible();

  const bot = page.getByRole('link', {name: /ResearchBot/});
  await expect(bot.getByText('score in market-research')).toBeVisible();
  await expect(bot.getByText('61', {exact: true})).toBeVisible();
  await expect(bot.getByText('2 settled · 0 failed')).toBeVisible();
  await expect(bot.getByText('overall 72')).toBeVisible();
  await expect(
    page.getByRole('link', {name: /Unproven/}).getByText('unproven at market-research'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('an agent profile breaks its record down by skill', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/agents/1');
  const table = page.getByRole('table', {name: 'Record by skill'});
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(3); // header + two skills
  await expect(table.getByRole('row', {name: /market-research/})).toContainText('61');
  await expect(table.getByRole('row', {name: /trade-analysis/})).toContainText('50%');

  await page.goto('/agents/2');
  await expect(page.getByRole('table', {name: 'Record by skill'}).getByText('unproven')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an agent profile renders, and a hostile explorer URL is not a link', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/agents/1');
  await expect(page.getByRole('heading', {name: 'ResearchBot'})).toBeVisible();
  // A NEAR account is shown in full, linked to NearBlocks.
  await expect(page.getByRole('link', {name: /^researchbot\.owner\.testnet/})).toHaveAttribute(
    'href',
    'https://testnet.nearblocks.io/address/researchbot.owner.testnet',
  );

  await expect(page.getByText(/on-chain id 42/)).toBeVisible(); // its id in the Pactora contract
  await page.goto('/agents/2');
  await expect(page.getByRole('heading', {name: 'Unproven'})).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a malformed agent id is a real 404', async ({page}) => {
  const res = await page.goto('/agents/abc');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', {name: 'Not found'})).toBeVisible();
});

test('a run renders its answer, steps and trace, with money as money', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto(`/runs/${RUN_ID}`);
  await expect(page.getByRole('heading', {level: 1})).toContainText('Research NEAR/USDC');
  await expect(page.getByText('Liquidity is thin; wait.')).toBeVisible();
  // The trace's total, formatted from base units with the token's decimals.
  await expect(
    page.getByRole('list', {name: 'Run trace'}).getByText('0.02 USDC', {exact: true}).last(),
  ).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a settled step on the run record proves its on-chain review', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto(`/runs/${RUN_ID}`);
  const proof = page.getByText(/Review written on chain for/);
  await expect(proof).toContainText('Review written on chain for ResearchBot — score now 72');
  // The proof is the settlement transaction, which wrote the review.
  await expect(page.getByRole('link', {name: /proof ↗/})).toHaveAttribute(
    'href',
    'https://testnet.nearblocks.io/txns/8Ha3ThYvqv4WQx2t4ZCSFmAS5hj7VG4EHVgPeLJP7tUZ',
  );
  expect(errors).toEqual([]);
});

test('a serial run id names nothing', async ({page}) => {
  const res = await page.goto('/runs/17');
  expect(res?.status()).toBe(404);
});

test('the run history needs a key and then lists runs', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/runs');
  await page.getByLabel('Orchestrator API key').fill('ax_0123456789abcdef_secret');
  await page.getByRole('button', {name: 'Show runs'}).click();
  await expect(page.getByRole('link', {name: /Research NEAR\/USDC/})).toHaveAttribute(
    'href',
    `/runs/${RUN_ID}`,
  );
  expect(errors).toEqual([]);
});

test('register explains NEAR Connect and validates before signing', async ({page}) => {
  const errors = watchConsole(page);
  await page.goto('/register');
  await expect(page.getByText(/Connect opens NEAR Connect/)).toBeVisible();
  // The agent account defaults from the name, and must be one account-id segment.
  await page.getByLabel('Name').fill('Research Bot');
  await expect(page.getByLabel(/Agent account/)).toHaveValue('research-bot');
  await page.getByLabel(/Agent account/).fill('Research.Bot');
  await expect(page.getByText(/lowercase letters, digits/)).toBeVisible();
  await expect(page.getByText(/0\.5 NEAR to the agent account and 0\.1 NEAR for storage/)).toBeVisible();
  await page.getByLabel(/Price per task/).fill('500');
  await expect(page.getByText(/Below the escrow minimum of 0.01 USDC/)).toBeVisible();
  expect(errors).toEqual([]);
});

// v3: who paid for a record, on the agent's own page.
test('an agent page says who paid for its record', async ({page}) => {
  await page.goto('/agents/1');
  await expect(page.getByText('Who paid for this record')).toBeVisible();
  await expect(page.getByText(/paid by many owners, none of them funded by this agent/)).toBeVisible();
  await expect(page.getByText(/14 paid jobs from 9 distinct owners/)).toBeVisible();
});

test('an agent with no history is called new, not bad', async ({page}) => {
  await page.goto('/agents/2');
  await expect(page.getByText(/too little history to judge yet/)).toBeVisible();
  await expect(page.getByText(/at least 3 are needed to judge/)).toBeVisible();
});

test('the status page names a wallet that is low on gas', async ({page}) => {
  await page.goto('/status');
  const gas = page.getByRole('region', {name: 'Gas'});
  await expect(gas).toContainText('a wallet is low');
  await expect(gas).toContainText('keeper');
  // Balances in NEAR (24 decimals); a named account in full, an implicit one shortened.
  await expect(gas).toContainText('4.6381 NEAR');
  await expect(gas).toContainText('0.09 NEAR — low');
  await expect(gas).toContainText('researchbot.owner.testnet');
  await expect(gas).toContainText('d5d5d5d5…d5d5d5d5');
});

test('the status page says what is degraded, in words', async ({page}) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('System status');
  await expect(page.getByText('Partially degraded')).toBeVisible();
  const indexer = page.getByRole('listitem').filter({hasText: 'Indexer'});
  await expect(indexer.getByText('Degraded')).toBeVisible();
  await expect(indexer).toContainText('Catching up — 400 blocks behind');
  await expect(page.getByText('400 blocks', {exact: true})).toBeVisible();
});

test('the menu works at phone width, and no page scrolls sideways', async ({page}) => {
  await page.setViewportSize({width: 375, height: 800});
  for (const path of [
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
    '/jobs/listing/lst-view',
    '/jobs/aaaaaaaa-0000-4000-8000-0000000000a1',
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
    '/docs/concepts',
    '/docs/api',
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await page.goto('/');
  const toggle = page.getByRole('button', {name: 'Open menu'});
  await toggle.click();
  await expect(page.locator('#mobile-nav').getByRole('link', {name: 'Marketplace'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-nav')).toBeHidden();
});

test('the information pages render, are linked from the footer, and log no errors', async ({page}) => {
  const errors = watchConsole(page);
  for (const [path, title] of [
    ['/about', 'About Pactora'],
    ['/fees', 'Fees and limits'],
    ['/risks', 'Risks'],
    ['/contact', 'Contact'],
    ['/terms', 'Terms of service'],
    ['/privacy', 'Privacy policy'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', {level: 1})).toHaveText(title);
    await expect(page).toHaveTitle(/· Pactora$/);
    await expect(page.getByRole('navigation', {name: 'Company'}).getByRole('link')).toHaveCount(6);
    // Leave only once the page's own requests are done. WebKit reports a fetch
    // cancelled by navigating away ("/v1/network … due to access control
    // checks") as a page error; waiting keeps that out without filtering it,
    // so a real cross-origin failure would still fail here.
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});

test('the fees page shows the network’s own values, read live', async ({page}) => {
  await page.goto('/fees');
  const row = (id: string) => page.locator(`[data-fee="${id}"]`);
  await expect(row('fee')).toContainText('1% of the job, at least 0.0001 USDC');
  await expect(row('bond')).toContainText('20% of the job, at least 0.01 USDC');
  await expect(row('maxJob')).toContainText('10 USDC');
  await expect(row('withdrawDelay')).toContainText('7 days');
  await expect(row('maxFee')).toContainText('10% of the job');
  await expect(page.getByTestId('network-badge')).toContainText(/Testnet/);
});

test('an API that does not publish a limit is said so, never filled in', async ({page}) => {
  await page.route(/\/v1\/network$/, async (route) => {
    const res = await route.fetch();
    const {bondBps: _b, minBond: _m, maxJobAmount: _x, withdrawDelaySeconds: _w, ...older} = await res.json();
    await route.fulfill({response: res, json: older});
  });
  await page.goto('/fees');
  const row = (id: string) => page.locator(`[data-fee="${id}"]`);
  await expect(row('fee')).toContainText('1% of the job');
  for (const id of ['bond', 'maxJob', 'withdrawDelay']) {
    await expect(row(id)).toContainText('not published by this API');
  }
  await expect(row('minStake')).toContainText('10 USDC');
});

test('the terms and privacy pages say they are drafts and show what is not decided', async ({page}) => {
  for (const path of ['/terms', '/privacy']) {
    await page.goto(path);
    await expect(page.getByText('Draft — testnet only. Not reviewed by a lawyer.')).toBeVisible();
    await expect(page.locator('mark', {hasText: '[COMPANY NAME]'}).first()).toBeVisible();
    await expect(page.locator('mark', {hasText: '[CONTACT EMAIL]'}).first()).toBeVisible();
  }
});

test('contact: no X link and no email link until they are set', async ({page}) => {
  await page.goto('/contact');
  await expect(page.getByText('Email address coming soon — use GitHub meanwhile')).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator('a[href*="x.com"], a[href*="twitter.com"]')).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'security page'})).toHaveAttribute(
    'href',
    '/docs/security#reporting',
  );
});

test('robots.txt and the sitemap are served, and the sitemap lists the public pages', async ({request}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Allow: \//);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const p of ['/about', '/fees', '/terms', '/privacy', '/docs/guides']) {
    expect(sitemap).toContain(`${p}</loc>`);
  }
});

test('the icons are served: favicon, apple icon and the manifest’s PNGs', async ({request}) => {
  expect((await request.get('/favicon.ico')).status()).toBe(200);
  expect((await request.get('/apple-icon')).headers()['content-type']).toContain('image/png');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
});

/** Motion off must lose nothing: sections that fade in on scroll are simply shown. */
test('with reduced motion, every revealed section is fully visible without scrolling', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  const problem = page.getByRole('heading', {name: /Agents can reason/});
  await expect(problem).toBeAttached();
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-reveal]')].filter((el) => getComputedStyle(el).opacity !== '1')
        .length,
  );
  expect(hidden).toBe(0);
});

test('every response carries the security headers', async ({request}) => {
  const res = await request.get('/');
  const headers = res.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain(
    `http://127.0.0.1:${process.env['MOCK_API_PORT'] ?? 8787}`,
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});
