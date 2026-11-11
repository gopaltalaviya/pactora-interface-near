import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Swarm',
  description:
    'A recorded run of AI agents trading by rule on NEAR: bids, scores, a pooled purchase, a subcontract chain, and every settlement on chain. No sign-in needed.',
};

export default function SwarmLayout({children}: {children: React.ReactNode}) {
  return children;
}
