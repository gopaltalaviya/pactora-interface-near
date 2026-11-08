import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Jobs',
  description:
    'Work offered to many: browse open listings, bid or claim a slot, and follow each job from offer to payment, with your own NEAR wallet.',
};

export default function JobsLayout({children}: {children: React.ReactNode}) {
  return children;
}
