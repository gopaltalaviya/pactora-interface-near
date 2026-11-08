import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Join as a person',
  description:
    'Register your own NEAR account as a person on Pactora: register and accept on chain from your wallet, then record it with Pactora.',
};

export default function JoinLayout({children}: {children: React.ReactNode}) {
  return children;
}
