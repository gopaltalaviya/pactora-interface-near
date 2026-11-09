import {expect, test} from '@playwright/test';
import {signInAs} from './helpers';

/**
 * Layout findings of the live audit of 2026-11-09 (docs/27 follow-up): the
 * header overflowed the viewport between 768 and ~1200px and, signed in, at
 * 1280–1440; the owner's Select/Reject buttons sat off-screen on a phone;
 * checkboxes were below the 24px target size; the account chip truncated with
 * no title. Each test failed on the old build.
 */

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [768, 820, 1024, 1280, 1440]) {
  for (const signed of [false, true]) {
    test(`no horizontal overflow at ${width}px, ${signed ? 'signed in' : 'signed out'}`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'a phone has its own viewport');
      await page.setViewportSize({width, height: 900});
      if (signed) await signInAs(page, 'uimw96w0z1-chrom6n-wanda.test.near'); // a real-length NEAR account id
      for (const path of ['/', '/jobs', '/me']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await overflow(page), `${path} at ${width}`).toBe(0);
        // Every visible header item ends inside the viewport.
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('header a, header button, header span[data-testid]')]
            .filter((e) => e.offsetParent !== null)
            .map((e) => ({
              text: (e.textContent ?? '').trim().slice(0, 20),
              right: e.getBoundingClientRect().right,
            }))
            .filter((x) => x.right > window.innerWidth + 0.5),
        );
        expect(clipped, `${path} at ${width}`).toEqual([]);
      }
    });
  }
}

test('on a phone the owner’s bids are cards, and Select is inside the viewport', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs/listing/lst-own-fund');
  const select = page.getByRole('button', {name: 'Select Nora'});
  await expect(select).toBeVisible();
  const box = (await select.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await overflow(page)).toBe(0);
  // No table on a phone: the bids read as cards.
  await expect(page.getByRole('table', {name: /Bids/})).toHaveCount(0);
  await expect(page.getByRole('list', {name: 'Bids'})).toBeVisible();
});

test('the account chip in the header carries the full account as its title', async ({page, isMobile}) => {
  test.skip(isMobile, 'the chip is hidden on a phone');
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs');
  const chip = page.getByRole('banner').getByRole('button', {name: /olive\.testnet|Account menu/});
  await expect(chip).toHaveAttribute('title', /olive\.testnet/);
});

test('checkboxes on /jobs and /me are at least 24px targets at 390px', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await signInAs(page, 'olive.testnet');
  await page.goto('/jobs');
  const matches = page.getByRole('checkbox', {name: 'Matches me'}).and(page.locator(':enabled'));
  await expect(matches).toBeVisible();
  const a = (await matches.boundingBox())!;
  // Rounded: a 1.5rem box measures 23.99999 under some zoom factors.
  expect(Math.round(Math.min(a.width, a.height))).toBeGreaterThanOrEqual(24);
  await page.goto('/me#profile');
  const publish = page.getByLabel(/Publish: list me/);
  await expect(publish).toBeVisible();
  const b = (await publish.boundingBox())!;
  expect(Math.round(Math.min(b.width, b.height))).toBeGreaterThanOrEqual(24);
});
