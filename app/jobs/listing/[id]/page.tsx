import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import type {Listing} from '@/lib/market';
import {readForMetadata} from '@/lib/server-meta';
import {ListingView} from './ListingView';

type Params = {params: Promise<{id: string}>};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The tab reads the listing's title, not "Listing" (live audit 2026-11-09, M4). */
export async function generateMetadata({params}: Params): Promise<Metadata> {
  const id = (await params).id;
  const base: Metadata = {
    description: 'One listing: what is asked, the ceiling, and how to bid or manage the bids.',
  };
  if (!ID.test(id)) return {...base, title: 'Listing not found'};
  const listing = await readForMetadata<Listing>(`/v1/listings/${encodeURIComponent(id)}`);
  return {...base, title: listing?.title ? `${listing.title} · listing` : 'Listing'};
}

/** A listing id is a short token; anything with other characters names nothing. */
export default async function ListingPage({params}: Params) {
  const id = (await params).id;
  if (!ID.test(id)) notFound();
  return <ListingView listingId={id} />;
}
