import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Admin console',
  description: 'For the arbiter council and compliance reviewers.',
  robots: {index: false, follow: false},
};

export default function AdminLayout({children}: {children: React.ReactNode}) {
  return children;
}
