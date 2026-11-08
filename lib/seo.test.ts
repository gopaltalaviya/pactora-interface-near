import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import {NOINDEX_ROUTES, PUBLIC_ROUTES} from './site';

const app = join(__dirname, '..', 'app');

/** Every page route in app/ with no dynamic segment: what a crawler can reach without an id. */
function staticRoutes(dir = app): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory() && !name.startsWith('[')) out.push(...staticRoutes(path));
  }
  if (existsSync(join(dir, 'page.tsx'))) {
    const rel = relative(app, dir).split(sep).join('/');
    out.push(rel ? `/${rel}` : '/');
  }
  return out;
}

afterEach(() => vi.unstubAllEnvs());

describe('sitemap', () => {
  it('lists every public page, and nothing that is not a page', () => {
    expect([...PUBLIC_ROUTES].sort()).toEqual(staticRoutes().sort());
  });

  it('leaves out the pages that ask not to be indexed', () => {
    const urls = sitemap().map((e) => e.url);
    const expected = PUBLIC_ROUTES.filter((r) => !NOINDEX_ROUTES.includes(r));
    expect(urls.length).toBe(expected.length);
    for (const r of NOINDEX_ROUTES) {
      expect(
        urls.some((u) => u.endsWith(r === '/' ? '/' : r)),
        r,
      ).toBe(r === '/');
    }
  });

  it('declares noindex in the layout of exactly the pages NOINDEX_ROUTES names', () => {
    const declared = staticRoutes().filter((route) => {
      // The page itself, or the layout beside it, or one above it.
      const dir = join(app, ...route.split('/').filter(Boolean));
      return [join(dir, 'page.tsx'), join(dir, 'layout.tsx')].some(
        (file) => existsSync(file) && /robots:\s*\{\s*index:\s*false/.test(readFileSync(file, 'utf8')),
      );
    });
    expect(declared.sort()).toEqual([...NOINDEX_ROUTES].sort());
    for (const r of NOINDEX_ROUTES) expect(PUBLIC_ROUTES).toContain(r);
  });

  it('includes the information pages', () => {
    for (const r of ['/about', '/fees', '/risks', '/contact', '/terms', '/privacy']) {
      expect(PUBLIC_ROUTES).toContain(r);
    }
  });

  it('gives absolute URLs on the deployment’s own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://pactora.example');
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain('https://pactora.example/');
    expect(urls).toContain('https://pactora.example/fees');
    expect(urls.every((u) => u.startsWith('https://pactora.example/'))).toBe(true);
  });
});

describe('robots.txt', () => {
  it('lets crawlers in and names the sitemap on the same origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://pactora.example/');
    const r = robots();
    expect(r.rules).toEqual({userAgent: '*', allow: '/'});
    expect(r.sitemap).toBe('https://pactora.example/sitemap.xml');
  });
});
