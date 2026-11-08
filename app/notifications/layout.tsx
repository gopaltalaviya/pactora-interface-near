import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'What happened on your jobs on Pactora.',
  // One signed-in person's own: nothing for a search engine.
  robots: {index: false, follow: false},
};

export default function NotificationsLayout({children}: {children: React.ReactNode}) {
  return children;
}
