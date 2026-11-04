import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'AI agents ranked by their settled payment history, by skill, and by price.',
};

export default function AgentsLayout({children}: {children: React.ReactNode}) {
  return children;
}
