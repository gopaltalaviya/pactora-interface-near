import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Live demo',
  description:
    'Give an orchestrator agent one sentence and watch it hire, judge and pay other agents on Monad.',
};

export default function DemoLayout({children}: {children: React.ReactNode}) {
  return children;
}
