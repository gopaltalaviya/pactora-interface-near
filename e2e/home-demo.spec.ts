import {expect, test, type Page} from '@playwright/test';

/**
 * The home page and the demo say what is true about them (2026-11-10):
 * the four directions a deal can go, a badge that does not oversell a
 * testnet, demo examples that a cached API can actually replay, and a
 * diagram that is still readable on a phone.
 */

test('the home page shows four ways to deal, each with its link', async ({page}) => {
  await page.goto('/');
  const section = page.getByRole('region', {name: 'Four ways to deal'});
  await expect(section).toBeVisible();
  const items = section.getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText(/Agent → agent/);
  await expect(items.nth(0).getByRole('link')).toHaveAttribute('href', '/docs/quickstart');
  await expect(items.nth(1)).toContainText(/Agent → person/);
  await expect(items.nth(1).getByRole('link')).toHaveAttribute('href', '/jobs');
  await expect(items.nth(2)).toContainText(/Person → agent/);
  await expect(items.nth(2)).toContainText(/Hire this agent/);
  await expect(items.nth(2)).toContainText(/bid_on_listing/);
  await expect(items.nth(2).getByRole('link')).toHaveAttribute('href', '/agents');
  await expect(items.nth(3)).toContainText(/Person → person/);
  await expect(items.nth(3).getByRole('link')).toHaveAttribute('href', '/jobs/new');
});

test('the hero badge says testnet and test tokens, not "real jobs"', async ({page}) => {
  await page.goto('/');
  const hero = page.getByRole('main');
  await expect(hero.getByRole('link', {name: /NEAR Testnet/})).toBeVisible();
  await expect(hero.getByRole('link', {name: /NEAR Testnet/})).toContainText(/test tokens/);
  await expect(hero).not.toContainText(/Settling real jobs/);
});

/** The demo player, its two sources, and an English captions track whose file is served (the videos have no sound). */
async function expectTourVideo(page: Page, which: 'demo') {
  // The poster and a play button first; the <video> exists only once asked for.
  await expect(page.locator(`video[data-testid="tour-video-${which}"]`)).toHaveCount(0);
  await page.getByRole('button', {name: /^Play .*captioned/}).click();
  const video = page.getByTestId(`tour-video-${which}`);
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('poster', `/video/${which}.jpg`);
  await expect(video.locator('source')).toHaveCount(2);
  await expect(video.locator('source').nth(0)).toHaveAttribute('src', `/video/${which}.webm`);
  await expect(video.locator('source').nth(1)).toHaveAttribute('src', `/video/${which}.mp4`);
  const track = video.locator('track');
  await expect(track).toHaveAttribute('kind', 'captions');
  await expect(track).toHaveAttribute('srclang', 'en');
  await expect(track).toHaveAttribute('src', `/video/${which}.vtt`);
  // The browser loaded the track and it is showing.
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) => {
        const t = v.textTracks[0];
        return t ? `${t.kind}:${t.mode}:${t.cues?.length ?? 0}` : 'none';
      }),
    )
    .toMatch(/^captions:showing:[1-9]\d*$/);
  for (const file of [`${which}.vtt`, `${which}.jpg`, `${which}.webm`, `${which}.mp4`]) {
    const res = await page.request.head(`/video/${file}`);
    expect(res.status(), file).toBe(200);
  }
  const vtt = await (await page.request.get(`/video/${which}.vtt`)).text();
  expect(vtt.startsWith('WEBVTT')).toBe(true);
}

test('the home page shows the captioned overview, and the hero CTA leads to it', async ({page}) => {
  // Reduced motion keeps the poster and its play button (no autoplay).
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/');
  await expect(page.getByRole('link', {name: /Watch agents pay each other/})).toHaveAttribute(
    'href',
    '#tour',
  );
  await expect(page.getByTestId('hero-cta-note')).toContainText(/captioned/);
  // 2026-11-13: the cut with the new opener, captions burned in, so no track (e2e/ux-audit.spec.ts).
  await expect(page.locator('video[data-testid="tour-video-overview"]')).toHaveCount(0);
  await page.getByRole('button', {name: /^Play .*captioned/}).click();
  const video = page.getByTestId('tour-video-overview');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('poster', '/video/hook-overview.jpg');
  await expect(video.locator('source')).toHaveCount(1);
  await expect(video.locator('source')).toHaveAttribute('src', '/video/hook-overview-x.mp4');
  await expect(video.locator('track')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(1);
});

test('/demo shows the captioned demo recording to a visitor without a key', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/demo');
  const slot = page.getByRole('region', {name: 'A recorded run'});
  await expectTourVideo(page, 'demo');
  await expect(slot.locator('video')).toHaveCount(1);
});

test('in cached mode the demo offers only the goal the API has a recording for', async ({page}) => {
  await page.goto('/demo');
  const chips = page.getByRole('button', {name: /^Use example:/});
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAccessibleName(
    'Use example: Research ETH/USDC liquidity on NEAR and tell me whether to open a position.',
  );
  await expect(page.getByTestId('cached-note')).toContainText(/recorded/);
});

test('a visitor without a key gets a "watch instead" slot on /demo', async ({page}) => {
  await page.goto('/demo');
  const slot = page.getByRole('region', {name: /No key\?/});
  await expect(slot).toBeVisible();
  await expect(slot.getByRole('link', {name: /past runs/})).toHaveAttribute('href', '/runs');
});

test('on a phone the hero diagram labels are readable', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  const label = page.getByText('Photographer', {exact: true}).locator('visible=true').first();
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(11);
});

// Owner's request, 2026-11-13: the videos start by themselves once in view, muted and looping.
for (const [path, which] of [
  ['/', 'overview'],
  ['/demo', 'demo'],
] as const) {
  test(`${path}: the ${which} video plays by itself, muted, once scrolled into view`, async ({page}) => {
    await page.goto(path);
    await page.waitForLoadState('load');
    // A video icon before the title says there is a video here.
    const heading = page.locator(which === 'overview' ? '#tour-heading' : '#recording-heading');
    await expect(heading.locator('svg[aria-hidden]')).toHaveCount(1);
    await page.getByTestId(`tour-poster-${which}`).scrollIntoViewIfNeeded();
    const video = page.getByTestId(`tour-video-${which}`);
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('data-autoplay', 'view');
    const state = await video.evaluate((v: HTMLVideoElement) => ({
      muted: v.muted,
      loop: v.loop,
      controls: v.controls,
    }));
    expect(state).toEqual({muted: true, loop: true, controls: true});
  });
}

// Owner's request, 2026-11-13: every core feature directly visible to a judge, each linked to its live page.
test('the home page lists every core feature, each opening the page that shows it', async ({page}) => {
  await page.goto('/');
  const section = page.getByRole('region', {name: 'Every core feature, live.'});
  await expect(section).toBeVisible();
  const tiles = section.getByTestId('core-feature');
  await expect(tiles).toHaveCount(10);
  const hrefs = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual([
    '/receipts',
    '/agents',
    '/swarm',
    '/agents/6',
    '/docs/security',
    '/docs/concepts#disputes',
    '/demo',
    '/jobs',
    '/docs/people#channels',
    '/docs/quickstart',
  ]);
  await expect(section).toContainText('Telegram job alerts');
  await expect(section).toContainText('Work credential NFTs');
});

test('the people guide shows the Telegram bot: how to link, an example chat, and what it does not do', async ({
  page,
}) => {
  await page.goto('/docs/people#channels');
  await expect(page.getByRole('heading', {name: 'Telegram job alerts'})).toBeVisible();
  await expect(page.getByRole('link', {name: '@PactoraJobsBot'})).toHaveAttribute(
    'href',
    'https://t.me/PactoraJobsBot',
  );
  const chat = page.getByTestId('telegram-preview');
  await chat.scrollIntoViewIfNeeded();
  await expect(chat).toContainText('Example chat');
  await expect(chat.getByRole('listitem')).toHaveCount(10, {timeout: 15_000});
  await expect(chat).toContainText('New bid on your listing');
  await expect(page.getByText(/does not run your account/)).toBeVisible();
});
