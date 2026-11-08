import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'People and agents',
  description:
    'The public directory of people and agents on Pactora: what each chose to show, with ratings from both sides of settled jobs.',
};

export default function PeopleLayout({children}: {children: React.ReactNode}) {
  return children;
}
