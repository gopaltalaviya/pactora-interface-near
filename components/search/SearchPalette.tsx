'use client';

import {usePathname, useRouter} from 'next/navigation';
import {useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode} from 'react';
import {DOCS} from '@/components/docs/DocsNav';
import {Icon, type IconName} from '@/components/ui/Icon';
import {api} from '@/lib/api';
import {prepare, search, sectionsFromHtml, type DocKind, type SearchDoc, type SearchHit} from '@/lib/search';
import {OPEN_SEARCH} from './events';

/**
 * The ⌘K / Ctrl+K command palette: the docs, the site's pages, quick actions
 * and the live marketplace, in one box.
 *
 * Mounted once (in the header). Anything may open it by dispatching
 * `pactora:search` on window — the header button, the docs sidebar button —
 * so there is never more than one dialog or one keyboard listener.
 *
 * The docs part of the index is built from the docs pages themselves,
 * fetched on first open and cached for the session, so it can never drift
 * from what the pages say.
 */

const PAGES: SearchDoc[] = [
  {
    id: 'p:/',
    kind: 'page',
    href: '/',
    title: 'Home',
    body: 'What Pactora is, live figures, how it works.',
    keywords: ['landing', 'overview', 'about'],
  },
  {
    id: 'p:/demo',
    kind: 'page',
    href: '/demo',
    title: 'Live demo',
    body: 'Give an orchestrator one sentence and watch agents hire, judge and pay.',
    keywords: ['run', 'goal', 'try', 'orchestrator'],
  },
  {
    id: 'p:/agents',
    kind: 'page',
    href: '/agents',
    title: 'Marketplace',
    body: 'Agents ranked by settled history and price.',
    keywords: ['agents', 'discover', 'ranking', 'score', 'reputation', 'hire'],
  },
  {
    id: 'p:/runs',
    kind: 'page',
    href: '/runs',
    title: 'Runs',
    body: 'Every goal an orchestrator was given, what it spent, and its trace.',
    keywords: ['history', 'trace', 'record'],
  },
  {
    id: 'p:/status',
    kind: 'page',
    href: '/status',
    title: 'System status',
    body: 'Whether Pactora is working right now.',
    keywords: ['health', 'uptime', 'outage', 'down', 'indexer', 'lag'],
  },
  {
    id: 'p:/register',
    kind: 'page',
    href: '/register',
    title: 'Register an agent',
    body: 'Its own NEAR account and on-chain registration, then the Pactora record and its API key.',
    keywords: ['signup', 'join', 'key', 'wallet', 'identity', 'near', 'account'],
  },
  {
    id: 'p:/about',
    kind: 'page',
    href: '/about',
    title: 'About Pactora',
    body: 'What the name means, what Pactora does, what keeps it safe, and where it stands.',
    keywords: ['company', 'name', 'meaning', 'agentx', 'operator', 'who'],
  },
  {
    id: 'p:/fees',
    kind: 'page',
    href: '/fees',
    title: 'Fees and limits',
    body: 'The protocol fee, bonds, job sizes, caps and time limits, read live from the network.',
    keywords: ['price', 'cost', 'fee', 'bond', 'stake', 'cap', 'limit', 'deadline', 'window'],
  },
  {
    id: 'p:/risks',
    kind: 'page',
    href: '/risks',
    title: 'Risks',
    body: 'What can go wrong, in plain words: contracts, agents, reputation, the signer, the arbiter.',
    keywords: ['risk', 'danger', 'audit', 'safety', 'loss', 'disclosure'],
  },
  {
    id: 'p:/contact',
    kind: 'page',
    href: '/contact',
    title: 'Contact',
    body: 'GitHub issues, private security reports, and email.',
    keywords: ['email', 'support', 'help', 'issue', 'bug', 'security', 'report'],
  },
  {
    id: 'p:/terms',
    kind: 'page',
    href: '/terms',
    title: 'Terms of service',
    body: 'Draft terms for using Pactora, testnet only.',
    keywords: ['legal', 'tos', 'agreement', 'rules'],
  },
  {
    id: 'p:/privacy',
    kind: 'page',
    href: '/privacy',
    title: 'Privacy policy',
    body: 'Draft: what data Pactora collects, who sees it, and how long it is kept.',
    keywords: ['data', 'gdpr', 'cookies', 'personal', 'ip'],
  },
];

const ACTIONS: SearchDoc[] = [
  {
    id: 'a:run',
    kind: 'action',
    href: '/demo',
    title: 'Start a live run',
    body: 'Paste an orchestrator key and press Run.',
    keywords: ['run', 'start', 'demo', 'try'],
  },
  {
    id: 'a:register',
    kind: 'action',
    href: '/register',
    title: 'Register your agent',
    body: 'Get a NEAR agent account and an API key.',
    keywords: ['register', 'new', 'create', 'signup'],
  },
  {
    id: 'a:status',
    kind: 'action',
    href: '/status',
    title: 'Check system status',
    body: 'Components, chain connection, indexer lag.',
    keywords: ['status', 'health'],
  },
  {
    id: 'a:quickstart',
    kind: 'action',
    href: '/docs/quickstart',
    title: 'Open the quickstart',
    body: 'From zero to a settled run.',
    keywords: ['start', 'begin', 'tutorial', 'setup'],
  },
];

const SUGGESTIONS = ['dispute timeout', 'score formula', 'MCP tools', 'idempotency', 'spending caps', 'x402'];
const GROUP: Record<DocKind, {label: string; icon: IconName}> = {
  action: {label: 'Actions', icon: 'bolt'},
  doc: {label: 'Documentation', icon: 'sparkle'},
  page: {label: 'Pages', icon: 'arrowRight'},
  agent: {label: 'Agents', icon: 'users'},
};
const ORDER: DocKind[] = ['action', 'doc', 'page', 'agent'];
const CACHE = 'pactora:search-docs:v1';
const RECENT = 'pactora:search-recent';

type Recent = {href: string; title: string; heading?: string};

function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as Recent[]).filter((r) => typeof r?.href === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}
function remember(r: Recent) {
  try {
    const next = [r, ...readRecent().filter((x) => x.href !== r.href)].slice(0, 5);
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): recent searches are a nicety, not a need.
  }
}

async function loadDocs(signal: AbortSignal): Promise<SearchDoc[]> {
  try {
    const cached = sessionStorage.getItem(CACHE);
    if (cached) return JSON.parse(cached) as SearchDoc[];
  } catch {
    // fall through to fetching
  }
  const paths = DOCS.flatMap((s) => s.pages.map((p) => p.href));
  const pages = await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(path, {signal});
        if (!res.ok) return [];
        const html = new DOMParser().parseFromString(await res.text(), 'text/html');
        return sectionsFromHtml(html, path);
      } catch {
        return [];
      }
    }),
  );
  const docs = pages.flat();
  try {
    if (docs.length) sessionStorage.setItem(CACHE, JSON.stringify(docs));
  } catch {
    // quota or blocked: just do not cache
  }
  return docs;
}

export function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [agents, setAgents] = useState<SearchDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setRecent(readRecent());
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }, []);

  // Ctrl/⌘+K anywhere; "/" on docs pages (the marketplace uses "/" for its own box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable="true"]',
      );
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (open) hide();
        else show();
      } else if (e.key === '/' && !typing && !open && pathname.startsWith('/docs')) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH, show);
    };
  }, [open, show, hide, pathname]);

  // Build the index on first open; refresh live agents on every open.
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    if (!docs) {
      setLoading(true);
      loadDocs(c.signal)
        .then((d) => !c.signal.aborted && setDocs(d))
        .finally(() => !c.signal.aborted && setLoading(false));
    }
    api
      .agents({limit: 50}, c.signal)
      .then((list) =>
        setAgents(
          list.map((a) => ({
            id: `agent:${a.agentId}`,
            kind: 'agent' as const,
            href: `/agents/${a.agentId}`,
            title: a.name,
            body: `${a.capabilities.join(' · ')} · ${a.priceDisplay}${a.completed + a.failed > 0 ? ` · score ${a.score}` : ' · unproven'}`,
            keywords: a.capabilities,
          })),
        ),
      )
      .catch(() => undefined);
    requestAnimationFrame(() => input.current?.focus());
    return () => c.abort();
  }, [open, docs]);

  // Lock page scroll behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const index = useMemo(() => prepare([...ACTIONS, ...PAGES, ...(docs ?? []), ...agents]), [docs, agents]);
  const hits = useMemo(() => (query.trim() ? search(index, query, 24) : []), [index, query]);
  const grouped = useMemo(() => {
    const out: {kind: DocKind; hits: SearchHit[]}[] = [];
    for (const kind of ORDER) {
      const g = hits.filter((h) => h.doc.kind === kind).slice(0, kind === 'doc' ? 8 : 4);
      if (g.length) out.push({kind, hits: g});
    }
    return out;
  }, [hits]);
  const flat = useMemo(() => grouped.flatMap((g) => g.hits), [grouped]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({block: 'nearest'});
  }, [active, listId]);

  const go = useCallback(
    (href: string, title: string, heading?: string) => {
      remember({href, title, ...(heading ? {heading} : {})});
      hide();
      router.push(href);
    },
    [hide, router],
  );

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = query.trim() ? flat.length : recent.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (count ? (a + 1) % count : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (count ? (a - 1 + count) % count : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        const hit = flat[active];
        if (hit) go(hit.doc.href, hit.doc.title, hit.doc.heading);
      } else {
        const r = recent[active];
        if (r) go(r.href, r.title, r.heading);
      }
    } else if (e.key === 'Tab') {
      // The dialog's only stop is the box; arrows move through the results.
      e.preventDefault();
    }
  };

  let optionIndex = -1;
  const activeId = (query.trim() ? flat.length : recent.length) ? `${listId}-opt-${active}` : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-0 sm:p-4 sm:pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={hide}
        className="absolute inset-0 cursor-default bg-ink/70 backdrop-blur-sm animate-enter"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Pactora"
        className="glow-border relative flex h-full w-full flex-col overflow-hidden bg-surface shadow-[0_30px_100px_-20px_rgb(0_0_0/0.8)] animate-enter sm:h-auto sm:max-h-[72vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-edge px-4">
          <Icon name="search" className="size-5 text-muted" />
          <input
            ref={input}
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search the docs, pages and agents"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={200}
            placeholder="Search docs, pages and agents…"
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70"
          />
          {loading && (
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-accent border-r-transparent"
            />
          )}
          <kbd className="hidden rounded border border-edge px-1.5 py-0.5 text-[10px] text-muted sm:inline">
            Esc
          </kbd>
          <button type="button" onClick={hide} className="text-sm text-muted sm:hidden">
            Cancel
          </button>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
          {!query.trim() && (
            <>
              {recent.length > 0 && (
                <Group label="Recent">
                  {recent.map((r, i) => (
                    <Option
                      key={r.href}
                      id={`${listId}-opt-${i}`}
                      selected={i === active}
                      onPick={() => go(r.href, r.title, r.heading)}
                      onHover={() => setActive(i)}
                      icon="refresh"
                      title={r.title}
                      heading={r.heading}
                    />
                  ))}
                </Group>
              )}
              <div className="px-3 pb-2 pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Try</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setQuery(s);
                        input.current?.focus();
                      }}
                      className="rounded-full border border-edge px-3 py-1 text-xs text-muted transition-colors hover:border-edge-strong hover:text-text"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {query.trim() && flat.length === 0 && !loading && (
            <div role="status" className="px-4 py-10 text-center">
              <p className="text-sm font-medium">No results for “{query.trim().slice(0, 60)}”</p>
              <p className="mt-1 text-xs text-muted">
                Try a single word (“escrow”, “dispute”, “score”), or browse the{' '}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => go('/docs', 'Documentation')}
                  className="text-accent underline"
                >
                  documentation
                </button>
                .
              </p>
            </div>
          )}

          {grouped.map((g) => (
            <Group key={g.kind} label={GROUP[g.kind].label}>
              {g.hits.map((h) => {
                optionIndex += 1;
                const i = optionIndex;
                return (
                  <Option
                    key={h.doc.id}
                    id={`${listId}-opt-${i}`}
                    selected={i === active}
                    onPick={() => go(h.doc.href, h.doc.title, h.doc.heading)}
                    onHover={() => setActive(i)}
                    icon={GROUP[h.doc.kind].icon}
                    title={<Marked text={h.doc.title} ranges={h.titleRanges} />}
                    heading={
                      h.doc.heading ? <Marked text={h.doc.heading} ranges={h.headingRanges} /> : undefined
                    }
                    snippet={
                      h.snippet.text ? <Marked text={h.snippet.text} ranges={h.snippet.ranges} /> : undefined
                    }
                  />
                );
              })}
            </Group>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-edge px-4 py-2 text-[11px] text-muted sm:flex">
          <span>
            <kbd className="rounded border border-edge px-1">↑</kbd>{' '}
            <kbd className="rounded border border-edge px-1">↓</kbd> move
          </span>
          <span>
            <kbd className="rounded border border-edge px-1">↵</kbd> open
          </span>
          <span>
            <kbd className="rounded border border-edge px-1">esc</kbd> close
          </span>
          <span className="ml-auto">Typos are fine — “dipsute” finds “dispute”.</span>
        </div>
      </div>
    </div>
  );
}

function Group({label, children}: {label: string; children: ReactNode}) {
  return (
    <div role="group" aria-label={label} className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      {children}
    </div>
  );
}

function Option({
  id,
  selected,
  onPick,
  onHover,
  icon,
  title,
  heading,
  snippet,
}: {
  id: string;
  selected: boolean;
  onPick: () => void;
  onHover: () => void;
  icon: IconName;
  title: ReactNode;
  heading?: ReactNode;
  snippet?: ReactNode;
}) {
  return (
    // The input owns focus (aria-activedescendant); options are picked by click or Enter.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      onClick={onPick}
      onMouseMove={onHover}
      className={
        'flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-colors ' +
        (selected ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-raised')
      }
    >
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border ${selected ? 'border-accent/50 text-accent' : 'border-edge text-muted'}`}
      >
        <Icon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          <span className="font-medium">{title}</span>
          {heading && (
            <>
              <span className="mx-1.5 text-muted">›</span>
              <span>{heading}</span>
            </>
          )}
        </span>
        {snippet && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">{snippet}</span>
        )}
      </span>
      {selected && <Icon name="arrowRight" className="mt-1.5 size-3.5 text-accent" />}
    </div>
  );
}

/** Text with matched ranges in <mark> — built as elements, never as HTML. */
function Marked({text, ranges}: {text: string; ranges: [number, number][]}) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges
    .slice()
    .sort((a, b) => a[0] - b[0])
    .forEach(([a, b], i) => {
      if (a < at) return;
      if (a > at) parts.push(text.slice(at, a));
      parts.push(
        <mark key={i} className="rounded bg-accent/20 px-0.5 text-text">
          {text.slice(a, b)}
        </mark>,
      );
      at = b;
    });
  parts.push(text.slice(at));
  return <>{parts}</>;
}
