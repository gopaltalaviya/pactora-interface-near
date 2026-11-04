/**
 * The search engine behind ⌘K. Pure functions, no DOM, so every ranking rule
 * is unit-tested.
 *
 * Documents are sections: a page title, or a heading with its following text,
 * each with the URL (and anchor) it lives at. A query matches word by word:
 *
 *   exact word      — full weight
 *   prefix          — "disp" finds "dispute"  (while typing)
 *   one typo        — "dipsute" finds "dispute" (words of 5+ letters)
 *
 * Weight by where the word is found: title > heading > body. Every query word
 * must match somewhere (AND), so adding words narrows results; a document
 * that contains the whole query as a phrase gets a bonus.
 */

export type DocKind = 'doc' | 'page' | 'agent' | 'action';

export interface SearchDoc {
  id: string;
  kind: DocKind;
  /** Where it opens: a path, optionally with #anchor. */
  href: string;
  /** Page or entity title. */
  title: string;
  /** The section heading, if this is a section of a page. */
  heading?: string;
  /** Body text of the section. */
  body: string;
  /** Extra words that should find it (synonyms, capability names…). */
  keywords?: string[];
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  /** Body excerpt around the first match, with match ranges to highlight. */
  snippet: {text: string; ranges: [number, number][]};
  /** Ranges to highlight in the title / heading. */
  titleRanges: [number, number][];
  headingRanges: [number, number][];
}

const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'it',
  'how',
  'what',
  'do',
  'i',
]);

/**
 * Lower-case words, accents folded, punctuation dropped (`ERC-8004` → `erc`,
 * `8004`). An identifier also yields its parts, after the whole word:
 * `expireDispute` → `expiredispute`, `expire`, `dispute`; `dispute_job` →
 * `dispute_job`, `dispute`, `job` — the docs are full of contract and tool
 * names, and a reader searches for the word inside them.
 */
export function tokenize(text: string): string[] {
  const raw =
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
  const out: string[] = [];
  for (const word of raw) {
    out.push(word.toLowerCase());
    const parts = word
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .split(/[\s_]+/)
      .filter(Boolean);
    if (parts.length > 1) for (const p of parts) out.push(p.toLowerCase());
  }
  return out;
}

export function queryTerms(query: string): string[] {
  const words = tokenize(query.slice(0, 200));
  const meaningful = words.filter((w) => !STOP.has(w));
  return [...new Set(meaningful.length ? meaningful : words)].slice(0, 8);
}

/** Damerau-free Levenshtein, bounded: true when distance ≤ 1. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      // A substitution — or an adjacent swap, which typing produces constantly.
      if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
        i += 2;
        j += 2;
        continue;
      }
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/**
 * A light stemmer, applied to both sides: "disputes", "disputed" and
 * "disputing" all meet "dispute". Deliberately crude — it only ever adds
 * matches between forms of one word, never between different words.
 */
export function stem(w: string): string {
  let r = w;
  if (r.length > 5 && r.endsWith('ing')) r = r.slice(0, -3);
  else if (r.length > 4 && r.endsWith('ied')) r = `${r.slice(0, -3)}y`;
  else if (r.length > 4 && r.endsWith('ed')) r = r.slice(0, -2);
  else if (r.length > 3 && r.endsWith('s') && !r.endsWith('ss')) r = r.slice(0, -1);
  // dispute / disputes / disputed / disputing all end as "disput".
  return r.length > 3 && r.endsWith('e') ? r.slice(0, -1) : r;
}

/**
 * The domain's vocabulary, so a reader's word finds the docs' word: someone
 * asking about a dispute "timeout" is reading about its "expiry" and
 * "window". Groups are symmetric. A synonym match weighs less than the word.
 */
const SYNONYMS: string[][] = [
  ['timeout', 'expire', 'expiry', 'deadline', 'window'],
  ['score', 'reputation', 'rating'],
  ['fee', 'commission'],
  ['hire', 'commission', 'employ'],
  ['refund', 'cancel'],
  ['pay', 'payment', 'settle', 'settlement', 'payout'],
  ['status', 'health', 'uptime'],
  ['wallet', 'account'],
  ['escrow', 'lock'],
  ['key', 'apikey', 'credential'],
];
const SYN = new Map<string, string[]>();
for (const group of SYNONYMS)
  for (const w of group)
    SYN.set(stem(w), [...(SYN.get(stem(w)) ?? []), ...group.filter((g) => g !== w).map(stem)]);

/** How well one query term matches a field's words, 0..1. */
function termWeight(term: string, words: string[]): number {
  const ts = stem(term);
  const syns = SYN.get(ts) ?? [];
  let best = 0;
  for (const w of words) {
    if (w === term) return 1;
    const ws = stem(w);
    if (ws === ts) best = Math.max(best, 0.9);
    else if (term.length >= 2 && w.startsWith(term)) best = Math.max(best, 0.75);
    else if (syns.includes(ws)) best = Math.max(best, 0.55);
    else if (best < 0.45 && term.length >= 5 && w.length >= 4 && withinOneEdit(term, w)) best = 0.45;
  }
  return best;
}

/** True when the body has every term inside a window of `span` words. */
function near(terms: string[], words: string[], span = 10): boolean {
  const hits = terms.map((t) => {
    const ts = stem(t);
    const at: number[] = [];
    words.forEach((w, i) => {
      if (w === t || stem(w) === ts || (t.length >= 3 && w.startsWith(t))) at.push(i);
      else if (t.length >= 5 && w.length >= 4 && withinOneEdit(t, w)) at.push(i);
    });
    return at;
  });
  if (hits.some((h) => h.length === 0)) return false;
  return hits[0]!.some((i) => hits.every((h) => h.some((j) => Math.abs(j - i) <= span)));
}

const FIELD_WEIGHT = {title: 6, heading: 4, keywords: 3, body: 1};
const KIND_BONUS: Record<DocKind, number> = {action: 0.6, page: 0.4, doc: 0, agent: 0.2};

interface Prepared {
  doc: SearchDoc;
  title: string[];
  heading: string[];
  keywords: string[];
  body: string[];
  flat: string;
}

export function prepare(docs: SearchDoc[]): Prepared[] {
  return docs.map((doc) => ({
    doc,
    title: tokenize(doc.title),
    heading: tokenize(doc.heading ?? ''),
    keywords: tokenize((doc.keywords ?? []).join(' ')),
    body: tokenize(doc.body),
    flat: tokenize(`${doc.title} ${doc.heading ?? ''} ${doc.body}`).join(' '),
  }));
}

export function search(index: Prepared[], query: string, limit = 12): SearchHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const phrase = terms.join(' ');
  const hits: SearchHit[] = [];

  for (const p of index) {
    let score = 0;
    let all = true;
    for (const t of terms) {
      const best =
        FIELD_WEIGHT.title * termWeight(t, p.title) +
        FIELD_WEIGHT.heading * termWeight(t, p.heading) +
        FIELD_WEIGHT.keywords * termWeight(t, p.keywords) +
        FIELD_WEIGHT.body * termWeight(t, p.body);
      if (best === 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (!all) continue;
    if (terms.length > 1 && p.flat.includes(phrase)) score += 3;
    // The terms together, not scattered across a long table.
    else if (terms.length > 1 && near(terms, [...p.heading, ...p.body])) score += 2;
    score += KIND_BONUS[p.doc.kind];
    // Shorter sections are more specific answers.
    score += Math.max(0, 1 - p.body.length / 400) * 0.5;
    hits.push({
      doc: p.doc,
      score,
      snippet: snippet(p.doc.body, terms),
      titleRanges: highlight(p.doc.title, terms),
      headingRanges: highlight(p.doc.heading ?? '', terms),
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title)).slice(0, limit);
}

/** Character ranges in `text` whose word starts with (or nearly equals) a term. */
export function highlight(text: string, terms: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  const re = /[\p{L}\p{N}_]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = tokenize(m[0])[0] ?? '';
    for (const t of terms) {
      if (word === t || (t.length >= 2 && word.startsWith(t)) || stem(word) === stem(t)) {
        ranges.push([m.index, m.index + Math.min(m[0].length, word === t ? m[0].length : t.length)]);
        break;
      }
      if (t.length >= 5 && word.length >= 4 && withinOneEdit(t, word)) {
        ranges.push([m.index, m.index + m[0].length]);
        break;
      }
    }
  }
  return ranges;
}

/** ~160 characters around the first match, cut at word boundaries. */
export function snippet(body: string, terms: string[], width = 160): SearchHit['snippet'] {
  const text = body.replace(/\s+/g, ' ').trim();
  const all = highlight(text, terms);
  if (text.length <= width) return {text, ranges: all};
  const first = all[0]?.[0] ?? 0;
  let start = Math.max(0, first - Math.floor(width / 3));
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space === -1 || space > first ? start : space + 1;
  }
  let end = Math.min(text.length, start + width);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + 40) end = space;
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const shift = start - prefix.length;
  return {
    text: prefix + text.slice(start, end) + suffix,
    ranges: all
      .filter(([a, b]) => a >= start && b <= end)
      .map(([a, b]) => [a - shift, b - shift] as [number, number]),
  };
}

/**
 * Sections of a rendered docs page: one for the page itself (title + lead),
 * and one per h2/h3 with the text that follows it until the next heading.
 */
export function sectionsFromHtml(doc: Document, path: string): SearchDoc[] {
  const article = doc.querySelector('article');
  if (!article) return [];
  const title = article.querySelector('h1')?.textContent?.trim() ?? path;
  const out: SearchDoc[] = [];
  const lead = article.querySelector('header p:last-of-type')?.textContent?.trim() ?? '';
  out.push({id: path, kind: 'doc', href: path, title, body: lead});

  let current: SearchDoc | null = null;
  const walker = doc.createTreeWalker(article, 1 /* NodeFilter.SHOW_ELEMENT */);
  let node = walker.nextNode() as Element | null;
  while (node) {
    const tag = node.tagName;
    if ((tag === 'H2' || tag === 'H3') && !node.closest('nav, header')) {
      const id = node.id || '';
      current = {
        id: `${path}#${id || out.length}`,
        kind: 'doc',
        href: id ? `${path}#${id}` : path,
        title,
        heading: node.textContent?.trim() ?? '',
        body: '',
      };
      out.push(current);
    } else if (current && /^(P|LI|TD|PRE|ASIDE)$/.test(tag) && !node.closest('nav')) {
      // Only leaf-ish blocks, so text is not counted twice.
      if (!node.querySelector('p, li, td, pre')) current.body += ` ${node.textContent ?? ''}`;
    }
    node = walker.nextNode() as Element | null;
  }
  return out.map((d) => ({...d, body: d.body.replace(/\s+/g, ' ').trim()}));
}
