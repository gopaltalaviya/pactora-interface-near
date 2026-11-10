import Link from 'next/link';
import {Badge, Tag} from '@/components/ui/Badge';
import {Card} from '@/components/ui/Card';
import {
  receivesDisplay,
  type Category,
  type InteractionMode,
  type Listing,
  type ListingStatus,
} from '@/lib/market';
import type {TokenInfo} from './hooks';

export const STATUS_TONE: Record<ListingStatus, 'live' | 'neutral' | 'settled' | 'refused'> = {
  open: 'live',
  closed: 'neutral',
  filled: 'settled',
  cancelled: 'refused',
};

/** The badges in words a visitor reads, not the API's enum values (2026-11-10). */
export const STATUS_WORDS: Record<ListingStatus, string> = {
  open: 'Open',
  closed: 'Hiring stopped',
  filled: 'All slots filled',
  cancelled: 'Cancelled',
};
export const CATEGORY_WORDS: Record<Category, string> = {
  physical: 'Physical work',
  expertise: 'Expertise',
  judgment: 'Judgment call',
};
export const MODE_WORDS: Record<InteractionMode, string> = {
  task: 'One-off task',
  conversation: 'Conversation',
  capture: 'Photos',
};

/** `2026-11-09T18:00:00Z` → `9 Nov 2026, 18:00 UTC`, the same wherever it is read. */
export function utc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString('en', {month: 'short', timeZone: 'UTC'})} ${d.getUTCFullYear()}, ${String(
    d.getUTCHours(),
  ).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/** What a listing is worth to a worker: the ceiling, and what is left of it after the fee. */
export function PriceLine({listing, token}: {listing: Listing; token: TokenInfo | null}) {
  return (
    <p className="text-sm">
      <span className="font-semibold tabular">Up to {listing.maxPriceDisplay}</span> per worker
      <span className="block text-xs text-muted">
        {token
          ? `Worker receives ${receivesDisplay(listing.workerReceivesAtCeilingBaseUnits, token.decimals, token.symbol)} after the fee`
          : 'Worker receives the ceiling minus the fee'}
      </span>
    </p>
  );
}

export function ListingCard({listing, token}: {listing: Listing; token: TokenInfo | null}) {
  return (
    <Card as="article" className="h-full">
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="chain">{CATEGORY_WORDS[listing.category] ?? listing.category}</Badge>
          <Badge>{MODE_WORDS[listing.interactionMode] ?? listing.interactionMode}</Badge>
          <Badge tone={STATUS_TONE[listing.status]}>{STATUS_WORDS[listing.status] ?? listing.status}</Badge>
          {listing.hiringMode === 'instant' && <Badge tone="live">Instant hiring</Badge>}
        </div>
        <h2 className="text-base font-semibold leading-snug">
          <Link
            href={`/jobs/listing/${encodeURIComponent(listing.listingId)}`}
            className="hover:text-accent focus-visible:text-accent"
          >
            {listing.title}
          </Link>
        </h2>
        <p className="line-clamp-2 text-sm text-muted">{listing.description}</p>
        {listing.skills.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
            {listing.skills.map((s) => (
              <li key={s}>
                <Tag>{s}</Tag>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto space-y-2 pt-1">
          <PriceLine listing={listing} token={token} />
          <p className="text-xs text-muted">
            {listing.slotsFilled} of {listing.maxWorkers} {listing.maxWorkers === 1 ? 'slot' : 'slots'} filled
            {listing.location ? ` · ${listing.location}` : ' · anywhere'} · by {listing.client.name}
          </p>
          <p className="text-xs text-muted">Deadline {utc(listing.deadline)}</p>
        </div>
      </div>
    </Card>
  );
}
