import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Simulated identity check',
  description: 'A testnet stand-in for an identity provider: no document is checked.',
  robots: {index: false, follow: false},
};

export default function SimulatedLayout({children}: {children: React.ReactNode}) {
  return children;
}
