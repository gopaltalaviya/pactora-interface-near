// @vitest-environment happy-dom
import {describe, expect, it} from 'vitest';
import {
  highlight,
  prepare,
  queryTerms,
  search,
  sectionsFromHtml,
  snippet,
  stem,
  tokenize,
  withinOneEdit,
  type SearchDoc,
} from './search';

const DOCS: SearchDoc[] = [
  {
    id: 'concepts#exits',
    kind: 'doc',
    href: '/docs/concepts#exits',
    title: 'How it works',
    heading: 'Four permissionless exits',
    body: 'No state can hold funds forever. If the arbiter never rules, expireDispute settles for the worker.',
  },
  {
    id: 'mcp#tools',
    kind: 'doc',
    href: '/docs/mcp#tools',
    title: 'MCP server',
    heading: 'The eight tools',
    body: 'hire_agent commissions an agent; dispute_job refuses payment for a delivered result.',
  },
  {
    id: 'status',
    kind: 'page',
    href: '/status',
    title: 'System status',
    body: 'Whether Pactora is working right now.',
    keywords: ['health', 'uptime', 'outage'],
  },
  {
    id: 'agent:2',
    kind: 'agent',
    href: '/agents/2',
    title: 'MarketResearch',
    body: 'market-research · 0.02 USDC',
  },
];
const index = prepare(DOCS);

describe('tokenize and query terms', () => {
  it('lower-cases, folds accents and splits on punctuation', () => {
    expect(tokenize('ERC-8004 Résumé, x402!')).toEqual(['erc', '8004', 'resume', 'x402']);
  });
  it('splits identifiers into their words, keeping the whole', () => {
    expect(tokenize('expireDispute dispute_job')).toEqual([
      'expiredispute',
      'expire',
      'dispute',
      'dispute_job',
      'dispute',
      'job',
    ]);
  });
  it('drops stop words unless the query is only stop words', () => {
    expect(queryTerms('how do I dispute a job')).toEqual(['dispute', 'job']);
    expect(queryTerms('the')).toEqual(['the']);
  });
  it('caps hostile input: 200 characters, 8 distinct terms', () => {
    expect(queryTerms('a '.repeat(10_000) + 'b').length).toBeLessThanOrEqual(8);
    expect(queryTerms('x'.repeat(5_000))[0]!.length).toBe(200);
  });
  it('treats regex and HTML characters as text, never as syntax', () => {
    expect(() => search(index, '.*(?<=x)[$^ <script>')).not.toThrow();
    expect(search(index, '<script>alert(1)</script>')).toEqual([]);
  });
});

describe('typo tolerance', () => {
  it('accepts one insertion, deletion, substitution or swap', () => {
    expect(withinOneEdit('dispute', 'dispute')).toBe(true);
    expect(withinOneEdit('dispte', 'dispute')).toBe(true);
    expect(withinOneEdit('disputee', 'dispute')).toBe(true);
    expect(withinOneEdit('dispote', 'dispute')).toBe(true);
    expect(withinOneEdit('dipsute', 'dispute')).toBe(true);
  });
  it('refuses two edits', () => {
    expect(withinOneEdit('dsipte', 'dispute')).toBe(false);
    expect(withinOneEdit('escrow', 'dispute')).toBe(false);
  });
});

describe('search', () => {
  it('finds a section by a word in its body, and points at its anchor', () => {
    const [top] = search(index, 'arbiter');
    expect(top!.doc.href).toBe('/docs/concepts#exits');
  });
  it('finds by prefix while typing', () => {
    expect(search(index, 'permissio')[0]!.doc.id).toBe('concepts#exits');
  });
  it('finds through a typo', () => {
    expect(search(index, 'arbitre')[0]!.doc.id).toBe('concepts#exits');
  });
  it('requires every term (AND)', () => {
    expect(search(index, 'dispute arbiter').map((h) => h.doc.id)).toEqual(['concepts#exits']);
    expect(search(index, 'dispute zebra')).toEqual([]);
  });
  it('ranks a heading match above a body match', () => {
    const hits = search(index, 'tools');
    expect(hits[0]!.doc.id).toBe('mcp#tools');
  });
  it('finds a page by its keywords (synonyms)', () => {
    expect(search(index, 'uptime')[0]!.doc.href).toBe('/status');
  });
  it('finds a live agent by name or capability', () => {
    expect(search(index, 'marketresearch')[0]!.doc.kind).toBe('agent');
    expect(search(index, 'market research')[0]!.doc.href).toBe('/agents/2');
  });
  it('returns nothing for an empty or punctuation-only query', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, '   ?!… ')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(search(index, 'a', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('smarter matching', () => {
  const extra = prepare([
    {
      id: 'win',
      kind: 'doc',
      href: '/docs/concepts#exits',
      title: 'How it works',
      heading: 'Four permissionless exits',
      body: 'If the arbiter never rules, the dispute timeout passes and anyone may settle for the worker.',
    },
    {
      id: 'far',
      kind: 'doc',
      href: '/docs/mcp#tools',
      title: 'MCP server',
      heading: 'The eight tools',
      body:
        'dispute_job refuses payment for a delivered result. ' +
        'other words here '.repeat(20) +
        'A timeout is not a lost payment.',
    },
    {
      id: 'rep',
      kind: 'doc',
      href: '/docs/concepts#reputation',
      title: 'How it works',
      heading: 'Reputation',
      body: 'The marketplace score.',
    },
  ]);
  it('stems both sides: plurals and tenses meet', () => {
    expect(stem('disputes')).toBe(stem('dispute'));
    expect(stem('settled')).toBe(stem('settles'));
    expect(search(extra, 'disputes')[0]!.doc.id).toBe('win');
  });
  it('a domain synonym finds the docs word', () => {
    expect(search(extra, 'expiry').map((h) => h.doc.id)).toContain('win');
    expect(search(extra, 'rating')[0]!.doc.id).toBe('rep');
  });
  it('ranks terms that appear together above the same terms scattered', () => {
    expect(search(extra, 'dipsute timeout')[0]!.doc.id).toBe('win');
  });
});

describe('highlight and snippet', () => {
  it('highlights whole words and prefixes', () => {
    expect(highlight('Four permissionless exits', ['permis'])).toEqual([[5, 11]]);
    expect(highlight('the arbiter rules', ['arbiter'])).toEqual([[4, 11]]);
  });
  it('cuts a long body around the first match, with ellipses and shifted ranges', () => {
    const body = `${'lorem ipsum '.repeat(40)}the arbiter never rules ${'dolor sit '.repeat(40)}`;
    const s = snippet(body, ['arbiter']);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    const [a, b] = s.ranges[0]!;
    expect(s.text.slice(a, b)).toBe('arbiter');
  });
});

describe('sections from a rendered docs page', () => {
  it('splits a page into its title and one section per heading, with anchors', () => {
    const html = `<article><header><p>Get started</p><h1>How it works</h1><p>The lead.</p></header>
      <h2 id="lifecycle">The job lifecycle</h2><p>Every hire is a job.</p>
      <h3 id="exits">Four exits</h3><ul><li>expireUnaccepted</li><li>expireDispute</li></ul>
      <nav aria-label="Previous and next page"><a href="/x">Next</a></nav></article>`;
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const sections = sectionsFromHtml(dom, '/docs/concepts');
    expect(sections.map((s) => s.href)).toEqual([
      '/docs/concepts',
      '/docs/concepts#lifecycle',
      '/docs/concepts#exits',
    ]);
    expect(sections[0]!.body).toBe('The lead.');
    expect(sections[2]!.body).toBe('expireUnaccepted expireDispute');
  });
});
