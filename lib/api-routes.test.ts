import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {ROUTES} from './api-routes';

/**
 * /docs/api shows a route table a developer will code against. The source of
 * truth is the API's own ROUTES in pactora-backend-near apps/api/src/openapi.ts
 * (the OpenAPI document is generated from it, and a backend test holds
 * docs/15-api.md equal to it): this holds the site's table equal to that
 * list — the same routes, as a set — so a route added to the API cannot be
 * missing here. Without the backend checkout (PACTORA_BACKEND_DIR, else the
 * checkout beside this one) the docs' endpoint index is read instead, in its
 * order. A missing file fails the test.
 */
const BACKEND_DIR = process.env.PACTORA_BACKEND_DIR
  ? resolve(process.env.PACTORA_BACKEND_DIR)
  : fileURLToPath(new URL('../../pactora-backend-near', import.meta.url));
const DOCS_DIR = process.env.PACTORA_DOCS_DIR
  ? resolve(process.env.PACTORA_DOCS_DIR)
  : fileURLToPath(new URL('../../pactora-docs-near', import.meta.url));

describe('the /docs/api route table', () => {
  const openapi = join(BACKEND_DIR, 'apps', 'api', 'src', 'openapi.ts');

  it('lists exactly the routes the API serves', () => {
    if (existsSync(openapi)) {
      const src = readFileSync(openapi, 'utf8');
      const body = src.slice(src.indexOf('ROUTES'));
      const served = [...body.matchAll(/method:\s*'(get|post|put|patch|delete)',\s*path:\s*'([^']+)'/g)].map(
        (m) => `${m[1]!.toUpperCase()} ${m[2]}`,
      );
      expect(served.length).toBeGreaterThan(10);
      expect([...ROUTES.map(([route]) => route)].sort()).toEqual([...new Set(served)].sort());
      return;
    }
    const doc = readFileSync(join(DOCS_DIR, 'docs', '15-api.md'), 'utf8');
    // §1 only: later sections repeat some routes in tables of their own.
    const index = doc.slice(doc.indexOf('## 1. Endpoint index'), doc.indexOf('## 2. '));
    const documented = [...index.matchAll(/^\| `(GET|POST|PATCH|PUT|DELETE) (\/[^`]*)` \|/gm)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(documented.length).toBeGreaterThan(10);
    expect(ROUTES.map(([route]) => route)).toEqual(documented);
  });

  it('says who may call each route and what it does, and names each route once', () => {
    const seen = new Set<string>();
    for (const [route, auth, what] of ROUTES) {
      expect(auth, route).not.toBe('');
      expect(what, route).not.toBe('');
      expect(seen.has(route), route).toBe(false);
      seen.add(route);
    }
  });
});
