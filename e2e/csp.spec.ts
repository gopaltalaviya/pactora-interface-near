import {expect, test} from '@playwright/test';

/**
 * The Content-Security-Policy is nonce-based (middleware.ts): script-src
 * carries a per-request nonce and no 'unsafe-inline'; every inline script
 * the page ships carries that nonce, so the browser runs nothing else. Pages
 * working under it is what every other spec proves (a violation is a console
 * error, and the smoke tests fail on any).
 */

const scriptSrc = (csp: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('script-src ')) ?? '';

test('every page answers with a nonce in script-src and no unsafe-inline', async ({request}) => {
  for (const path of ['/', '/jobs', '/docs/mcp', '/agents/1']) {
    const res = await request.get(path);
    const csp = res.headers()['content-security-policy'] ?? '';
    const src = scriptSrc(csp);
    expect(src, path).toMatch(/'nonce-[A-Za-z0-9+/=_-]{16,}'/);
    expect(src, path).not.toContain("'unsafe-inline'");
    // The nonce is per request.
    const again = scriptSrc((await request.get(path)).headers()['content-security-policy'] ?? '');
    expect(again).not.toBe(src);
  }
});

test('every inline script in the HTML carries the response’s nonce', async ({request}) => {
  const res = await request.get('/');
  const nonce = /'nonce-([^']+)'/.exec(res.headers()['content-security-policy'] ?? '')?.[1];
  expect(nonce).toBeTruthy();
  const html = await res.text();
  const inline = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!).filter((a) => !/\bsrc=/.test(a));
  expect(inline.length).toBeGreaterThan(0);
  for (const attrs of inline) expect(attrs).toContain(`nonce="${nonce}"`);
});

test('the page runs under the nonce CSP without a console error', async ({page}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to fetch RSC payload|_rsc=/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.goto('/jobs');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Work on offer');
  expect(errors).toEqual([]);
});
