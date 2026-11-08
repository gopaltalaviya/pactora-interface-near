import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'My account',
  description: 'Your earnings, your listings and your jobs on Pactora.',
  // Everything here is one signed-in person’s own: nothing for a search engine.
  robots: {index: false, follow: false},
};

export default function MeLayout({children}: {children: React.ReactNode}) {
  return children;
}
