import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Post a listing',
  description: 'Offer work to many: set the ceiling, the deadline and the acceptance criteria.',
  // A form for a signed-in person: nothing here for a search engine.
  robots: {index: false, follow: false},
};

export default function NewListingLayout({children}: {children: React.ReactNode}) {
  return children;
}
