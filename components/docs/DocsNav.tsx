'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {SearchButton} from '@/components/search/SearchButton';
import {Icon} from '@/components/ui/Icon';

/**
 * The docs' table of contents — one list, used by the sidebar and by the
 * previous/next links at the foot of each page, so the order cannot drift.
 */
export const DOCS: {section: string; pages: {href: string; title: string}[]}[] = [
  {
    section: 'Get started',
    pages: [
      {href: '/docs', title: 'Introduction'},
      {href: '/docs/quickstart', title: 'Quickstart'},
      {href: '/docs/concepts', title: 'How it works'},
      {href: '/docs/guides', title: 'Video guides'},
    ],
  },
  {
    section: 'Build',
    pages: [
      {href: '/docs/build-an-agent', title: 'Build an agent'},
      {href: '/docs/mcp', title: 'MCP server'},
      {href: '/docs/api', title: 'HTTP API'},
    ],
  },
  {
    section: 'Trust',
    pages: [
      {href: '/docs/security', title: 'Security model'},
      {href: '/docs/faq', title: 'FAQ'},
    ],
  },
];

const FLAT = DOCS.flatMap((s) => s.pages);

export function DocsSidebar() {
  const path = usePathname() ?? '/docs';
  return (
    <nav aria-label="Documentation" className="space-y-6 text-sm">
      <SearchButton wide />
      {DOCS.map((s) => (
        <div key={s.section} className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{s.section}</p>
          <ul className="space-y-0.5 border-l border-edge">
            {s.pages.map((p) => {
              const active = path === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      '-ml-px block border-l py-1.5 pl-4 transition-colors ' +
                      (active
                        ? 'border-accent font-medium text-text'
                        : 'border-transparent text-muted hover:border-edge-strong hover:text-text')
                    }
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** A compact picker for narrow screens, where the sidebar does not fit. */
export function DocsMobileNav() {
  const path = usePathname() ?? '/docs';
  const current = FLAT.find((p) => p.href === path);
  return (
    <details className="group rounded-xl border border-edge bg-surface/80 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
        <span>
          <span className="text-muted">Docs · </span>
          {current?.title ?? 'Contents'}
        </span>
        <Icon name="menu" className="size-4 text-muted" />
      </summary>
      <div className="details-panel border-t border-edge px-4 py-4">
        <DocsSidebar />
      </div>
    </details>
  );
}

export function DocsPager() {
  const path = usePathname() ?? '/docs';
  const i = FLAT.findIndex((p) => p.href === path);
  const prev = i > 0 ? FLAT[i - 1] : null;
  const next = i >= 0 && i < FLAT.length - 1 ? FLAT[i + 1] : null;
  return (
    <nav
      aria-label="Previous and next page"
      className="mt-16 grid gap-3 border-t border-edge pt-8 sm:grid-cols-2"
    >
      {prev ? (
        <Link href={prev.href} className="card-interactive rounded-xl border border-edge bg-surface/60 p-4">
          <span className="flex items-center gap-1 text-xs text-muted">
            <Icon name="arrowLeft" className="size-3" /> Previous
          </span>
          <span className="mt-1 block font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.href}
          className="card-interactive rounded-xl border border-edge bg-surface/60 p-4 text-right"
        >
          <span className="flex items-center justify-end gap-1 text-xs text-muted">
            Next <Icon name="arrowRight" className="size-3" />
          </span>
          <span className="mt-1 block font-medium">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
