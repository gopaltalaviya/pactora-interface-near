import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Runs',
  description: 'Every goal an orchestrator was given, what it spent, and its full trace.',
};

export default function RunsLayout({children}: {children: React.ReactNode}) {
  return children;
}
