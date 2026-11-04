import {expect, test} from '@playwright/test';

/**
 * The video guides. Playwright's Chromium has no H.264 decoder (every real
 * browser does), so this checks what the browser is handed — a video per
 * guide, a captions track that is real WebVTT, a poster, the file itself —
 * not playback.
 */
const SLUGS = ['first-run', 'run-record', 'find-agents', 'system-health', 'register-agent', 'search-docs'];

test('the guides page has every guide, each with captions on by default and a poster', async ({
  page,
  request,
}) => {
  await page.goto('/docs/guides');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Video guides');
  const videos = page.locator('video');
  await expect(videos).toHaveCount(SLUGS.length);
  for (const slug of SLUGS) {
    const video = page.locator(`video:has(source[src="/guides/${slug}.mp4"])`);
    await expect(video).toHaveAttribute('preload', 'none'); // nothing downloads until play
    await expect(video).toHaveAttribute('poster', `/guides/${slug}.jpg`);
    await expect(video.locator('track[kind="captions"]')).toHaveAttribute('default', '');

    const vtt = await request.get(`/guides/${slug}.vtt`);
    expect(vtt.ok()).toBe(true);
    const text = await vtt.text();
    expect(text.startsWith('WEBVTT')).toBe(true);
    expect(text).toMatch(/\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/);

    const mp4 = await request.get(`/guides/${slug}.mp4`);
    expect(mp4.ok()).toBe(true);
    expect(mp4.headers()['content-type']).toContain('video/mp4');
    expect((await mp4.body()).length).toBeLessThan(2_500_000); // small enough for the docs

    expect((await request.get(`/guides/${slug}.jpg`)).ok()).toBe(true);
  }
});

test('the guides are embedded where they are needed, and findable by search', async ({page}) => {
  await page.goto('/docs/quickstart');
  await expect(page.locator('video source[src="/guides/first-run.mp4"]')).toHaveCount(1);
  await page.goto('/docs/build-an-agent');
  await expect(page.locator('video source[src="/guides/register-agent.mp4"]')).toHaveCount(1);
  await page.goto('/docs');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', {name: 'Search the docs, pages and agents'}).fill('video guides');
  await expect(page.getByRole('listbox', {name: 'Results'}).getByRole('option').first()).toContainText(
    /Video guides/,
  );
});
