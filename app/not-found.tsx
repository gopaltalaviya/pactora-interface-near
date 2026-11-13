import type {Metadata} from 'next';
import {SearchSiteButton} from '@/components/search/SearchSiteButton';
import {ButtonLink} from '@/components/ui/Button';
import {Icon} from '@/components/ui/Icon';

export const metadata: Metadata = {title: 'Not found', robots: {index: false}};

/** Where to go instead: the main pages, and the search (UX audit 2026-11-13: it spoke only of run links). */
const PLACES = [
  {href: '/jobs', label: 'Jobs'},
  {href: '/agents', label: 'Marketplace'},
  {href: '/receipts', label: 'Receipts'},
  {href: '/swarm', label: 'Swarm'},
] as const;

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-16 text-center">
      <span className="tabular bg-gradient-to-b from-text to-muted/40 bg-clip-text text-7xl font-semibold text-transparent">
        404
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm leading-relaxed text-muted">
        There is no page at this address. The link may be mistyped, or what it pointed to has moved. Try one
        of these, or search the site.
      </p>
      <nav aria-label="Pages to try" className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" variant="primary">
          Home <Icon name="arrowRight" />
        </ButtonLink>
        {PLACES.map((p) => (
          <ButtonLink key={p.href} href={p.href}>
            {p.label}
          </ButtonLink>
        ))}
      </nav>
      <SearchSiteButton />
    </div>
  );
}
