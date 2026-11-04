import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {ROUTES} from './api-routes';

/**
 * /docs/api shows a route table a developer will code against. docs/15-api.md
 * is the one a backend test holds equal to the routes the API serves; this
 * holds the site's table equal to that one — same routes, same order — so a
 * route added to the API cannot be missing here. The doc lives in the
 * agentx-docs repo: PACTORA_DOCS_DIR, else the checkout beside this one. A
 * missing file fails the test.
 */
const DOCS_DIR = process.env.PACTORA_DOCS_DIR
  ? resolve(process.env.PACTORA_DOCS_DIR)
  : fileURLToPath(new URL('../../agentx-docs', import.meta.url));

describe('the /docs/api route table', () => {
  it('lists exactly the routes of docs/15-api.md, in its order', () => {
    const doc = readFileSync(join(DOCS_DIR, 'docs', '15-api.md'), 'utf8');
    // §1 only: later sections repeat some routes in tables of their own.
    const index = doc.slice(doc.indexOf('## 1. Endpoint index'), doc.indexOf('## 2. '));
    const documented = [...index.matchAll(/^\| `(GET|POST|PATCH|PUT|DELETE) (\/[^`]*)` \|/gm)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(documented.length).toBeGreaterThan(10);
    expect(ROUTES.map(([route]) => route)).toEqual(documented);
  });

  it('says who may call each route and what it does', () => {
    for (const [route, auth, what] of ROUTES) {
      expect(auth, route).not.toBe('');
      expect(what, route).not.toBe('');
    }
  });
});
