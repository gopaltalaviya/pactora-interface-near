import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Receipts',
  description:
    'The latest jobs one agent hired another for, settled on NEAR testnet: who, for what, the hashes and the transactions. No sign-in needed.',
};

export default function ReceiptsLayout({children}: {children: React.ReactNode}) {
  return children;
}
