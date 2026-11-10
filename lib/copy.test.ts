import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {API_ERRORS} from './api-errors';
import {ROUTES} from './api-routes';
import {MCP_TOOLS} from './mcp-tools';

/**
 * Copy that must agree with the code, the contracts and the sibling repos
 * (2026-11-09). Each test here failed on the copy before its fix, so a
 * regression reads as the same failure.
 *
 * The backend checkout is read when it is there (PACTORA_BACKEND_DIR, else
 * beside this repo), so the tool and error lists cannot drift from it.
 */
const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const BACKEND_DIR = process.env['PACTORA_BACKEND_DIR']
  ? resolve(process.env['PACTORA_BACKEND_DIR'])
  : fileURLToPath(new URL('../../pactora-backend-near', import.meta.url));

/** Every page route in app/, dynamic segments as written (`/agents/[id]`). */
function pageRoutes(dir = join(root, 'app')): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory() && !name.startsWith('.')) out.push(...pageRoutes(path));
  }
  if (existsSync(join(dir, 'page.tsx'))) {
    const rel = relative(join(root, 'app'), dir).split(sep).join('/');
    out.push(rel ? `/${rel}` : '/');
  }
  return out;
}

/** Every file under `dir` with one of the extensions. */
function files(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

describe('README.md', () => {
  const readme = read('README.md');

  it('sends the reader to /agents, the marketplace, never to a /marketplace that does not exist', () => {
    expect(readme).not.toContain('/marketplace');
    expect(readme).toContain('/agents');
  });

  it('says a browser signs registration, funding and a person’s own job actions, each allow-listed', () => {
    expect(readme).not.toMatch(/the one on-chain action a\s+browser takes/);
    expect(readme).toMatch(/lib\/wallet-guard\.ts/);
    expect(readme).toMatch(/registration, funding/i);
  });

  it('lists every page route in its pages table', () => {
    const globs = [...readme.matchAll(/`(\/[^`*]*)\*`/g)].map((m) => m[1]!);
    const missing = pageRoutes().filter(
      (route) =>
        !readme.includes(`\`${route}\``) &&
        !globs.some((g) => route.startsWith(g) || route === g.slice(0, -1)),
    );
    expect(missing).toEqual([]);
  });

  it('has a "Built with" list, the positioning paragraph, the disclosure and the diff link', () => {
    expect(readme).toMatch(/^## Built with/m);
    for (const lib of [
      'Next.js',
      'React',
      '@hot-labs/near-connect',
      'Tailwind',
      'Vitest',
      'Playwright',
      'axe',
    ])
      expect(readme, lib).toContain(lib);
    expect(readme).toMatch(/^## Positioning/m);
    expect(readme).toMatch(/NEAR Agent Market/);
    expect(readme).toContain('pre-hackathon');
    expect(readme).toContain('compare/pre-hackathon...hackathon-submission');
  });
});

describe('.env.example', () => {
  const env = read('.env.example');

  it('names every NEXT_PUBLIC_ variable the code reads, each with a meaning', () => {
    const used = new Set<string>();
    const sources = [
      ...files(join(root, 'lib'), ['.ts', '.tsx', '.mjs']),
      ...files(join(root, 'app'), ['.ts', '.tsx']),
      ...files(join(root, 'components'), ['.ts', '.tsx']),
      join(root, 'next.config.mjs'),
      ...(existsSync(join(root, 'middleware.ts')) ? [join(root, 'middleware.ts')] : []),
    ].filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
    for (const f of sources)
      for (const m of readFileSync(f, 'utf8').matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) used.add(m[0]);
    expect(used.size).toBeGreaterThan(5);
    const missing = [...used].filter((name) => !new RegExp(`^#?\\s*${name}=`, 'm').test(env));
    expect(missing).toEqual([]);
  });

  it('says a production build fails without NEXT_PUBLIC_API_URL', () => {
    expect(env).toMatch(/production build[^\n]*fails|fails[^\n]*production build/i);
  });
});

describe('what the pages say about the dispute bond (contract 1.1.0)', () => {
  const pages = [
    'app/docs/concepts/page.tsx',
    'app/docs/security/page.tsx',
    'app/risks/page.tsx',
    'app/jobs/[id]/JobView.tsx',
    'components/market/Evidence.tsx',
    'app/fees/page.tsx',
    'app/fees/FeesTable.tsx',
    'app/terms/page.tsx',
    'app/docs/faq/page.tsx',
    'app/page.tsx',
    'lib/fees.ts',
    'lib/market.ts',
  ];

  it('never says the bond comes back whole when the arbiter never rules', () => {
    for (const p of pages) {
      const text = read(p).replace(/\s+/g, ' ');
      expect(text, p).not.toMatch(/bond comes back/i);
      expect(text, p).not.toMatch(/gets the dispute bond back/i);
      expect(text, p).not.toMatch(/dispute bond back/i);
      expect(text, p).not.toMatch(/never rules, the bond comes back/i);
    }
  });

  it('says the split: half to the worker, half back to the client, after the deadline and a grace', () => {
    for (const p of ['app/docs/concepts/page.tsx', 'app/docs/security/page.tsx', 'app/risks/page.tsx']) {
      const text = read(p).replace(/\s+/g, ' ');
      expect(text, p).toMatch(/half/i);
      expect(text, p).toMatch(/grace/i);
    }
    const concepts = read('app/docs/concepts/page.tsx').replace(/\s+/g, ' ');
    expect(concepts).toMatch(/7 days/);
    expect(concepts).toMatch(/24 h/);
  });
});

describe('the MCP tools page', () => {
  it('lists every tool the server has, by name, and no longer says nine', () => {
    const page = read('app/docs/mcp/page.tsx');
    expect(page).not.toMatch(/nine tools/i);
    expect(MCP_TOOLS.length).toBeGreaterThanOrEqual(28);
    const toolsFile = join(BACKEND_DIR, 'apps', 'mcp', 'src', 'tools.ts');
    if (existsSync(toolsFile)) {
      const names = [...readFileSync(toolsFile, 'utf8').matchAll(/^\s+name: '([a-z_]+)',$/gm)].map(
        (m) => m[1],
      );
      expect(MCP_TOOLS.map(([name]) => name).sort()).toEqual([...new Set(names)].sort());
    }
    for (const [name, effect, what] of MCP_TOOLS) {
      expect(['read', 'spends', 'writes'], name).toContain(effect);
      expect(what, name).not.toBe('');
    }
  });

  it('mentions the HTTP transport and the bearer key', () => {
    const page = read('app/docs/mcp/page.tsx').replace(/\s+/g, ' ');
    expect(page).toMatch(/HTTP/);
    expect(page).toMatch(/bearer/i);
  });
});

describe('what the pages say about the contract tests', () => {
  const CONTRACTS_DIR = process.env['PACTORA_CONTRACTS_DIR']
    ? resolve(process.env['PACTORA_CONTRACTS_DIR'])
    : fileURLToPath(new URL('../../pactora-contracts-near', import.meta.url));

  /** #[test] and #[tokio::test] functions in the contract sources (target/ and node_modules/ skipped). */
  function contractTests(dir = join(CONTRACTS_DIR, 'contracts')): number {
    let n = 0;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== 'target' && name !== 'node_modules') n += contractTests(path);
      } else if (name.endsWith('.rs')) {
        n += readFileSync(path, 'utf8').match(/^\s*#\[(?:tokio::)?test\b/gm)?.length ?? 0;
      }
    }
    return n;
  }

  it('give the count the contract sources have, and no invariant suites that are not there', () => {
    const landing = read('app/page.tsx');
    const tile = /k: '(\d+)',\s*t: 'contract tests'/.exec(landing);
    expect(tile, 'the landing page has a "contract tests" tile').not.toBeNull();
    expect(landing).not.toMatch(/invariant suites/);
    const n = Number(tile![1]);
    for (const p of ['app/about/page.tsx', 'app/docs/security/page.tsx'])
      expect(read(p).replace(/\s+/g, ' '), p).toContain(`${n} tests`);
    if (existsSync(join(CONTRACTS_DIR, 'contracts'))) expect(n).toBe(contractTests());
  });
});

describe('the HTTP API page', () => {
  it('documents every error code the API can answer with', () => {
    const codes = new Set(API_ERRORS.flatMap(([c]) => c.split(' · ')));
    for (const code of [
      'WRONG_CREDENTIAL',
      'COUNTERPARTY_BLOCKED',
      'CHAIN_MISMATCH',
      'CHAIN_NOT_ENABLED',
      'RESULT_MISMATCH',
      'LIMIT_REACHED',
      'ALREADY_EXISTS',
      'INTERNAL',
    ])
      expect(codes, code).toContain(code);
    const errorsFile = join(BACKEND_DIR, 'packages', 'shared', 'src', 'errors.ts');
    if (existsSync(errorsFile)) {
      const block = /ERROR_STATUS[^{]*\{([\s\S]*?)\n\};/.exec(readFileSync(errorsFile, 'utf8'))?.[1] ?? '';
      for (const m of block.matchAll(/^\s+([A-Z_]+):/gm)) expect(codes, m[1]).toContain(m[1]!);
    }
  });

  it('describes /health as naming the contract, not an escrow address', () => {
    const health = ROUTES.find(([r]) => r === 'GET /health')!;
    expect(health[2]).not.toMatch(/escrow address/);
    expect(health[2]).toMatch(/contract/);
  });
});

describe('copy that must tell the truth (2026-11-10)', () => {
  it('the join page does not say people cannot be hired', () => {
    expect(read('app/join/page.tsx')).not.toMatch(/cannot be hired yet/);
  });

  it('the people guide says the session ends with the tab, as lib/session.tsx keeps it', () => {
    const page = read('app/docs/people/page.tsx').replace(/\s+/g, ' ');
    expect(page).not.toMatch(/session for 7 days/);
    expect(page).toMatch(/until you close the tab/);
  });

  it('testnet amounts are in mUSDC, the token the testnet contract deploys', () => {
    for (const p of ['app/docs/concepts/page.tsx', 'app/risks/page.tsx', 'app/page.tsx']) {
      const src = read(p).replace(/\s+/g, ' ');
      expect(src, p).not.toMatch(/\d(\.\d+)? USDC/);
    }
  });

  it('a person bids, never applies', () => {
    expect(read('app/docs/people/page.tsx').replace(/\s+/g, ' ')).not.toMatch(/cannot apply/);
    expect(read('lib/kyc.ts')).not.toMatch(/applying/);
  });

  it('the home FAQ names the same four exits the contract has', () => {
    const page = read('app/page.tsx').replace(/\s+/g, ' ');
    const answer = page.slice(page.indexOf('takes the money and disappears'));
    expect(answer.slice(0, 600)).toMatch(/four permissionless exits/);
    expect(answer.slice(0, 600)).toMatch(/never reviews/);
  });

  it('the one-sentence answers include people', () => {
    const home = read('app/page.tsx').replace(/\s+/g, ' ');
    const sentence = home.slice(home.indexOf('in one sentence?'), home.indexOf('in one sentence?') + 400);
    expect(sentence).toMatch(/people/);
    expect(read('app/layout.tsx')).toMatch(/DESCRIPTION =[^;]*people/);
    const docs = read('app/docs/page.tsx').replace(/\s+/g, ' ');
    expect(docs.slice(docs.indexOf('lead='), docs.indexOf('lead=') + 400)).toMatch(/people/);
    const next = docs.slice(docs.indexOf('Where to go next'));
    expect(next).toMatch(/href: '\/docs\/people'/);
  });
});
