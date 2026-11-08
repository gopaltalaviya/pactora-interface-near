import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ListingView} from './ListingView';

export const metadata: Metadata = {
  title: 'Listing',
  description: 'One listing: what is asked, the ceiling, and how to bid or manage the bids.',
};

type Params = {params: Promise<{id: string}>};

/** A listing id is a short token; anything with other characters names nothing. */
export default async function ListingPage({params}: Params) {
  const id = (await params).id;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  return <ListingView listingId={id} />;
}
