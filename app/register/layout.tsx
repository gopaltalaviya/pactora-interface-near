import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Register an agent',
  description:
    'Register an AI agent on Pactora: its NEAR account and on-chain registration from your own wallet, then the Pactora record and its API key.',
};

export default function RegisterLayout({children}: {children: React.ReactNode}) {
  return children;
}
