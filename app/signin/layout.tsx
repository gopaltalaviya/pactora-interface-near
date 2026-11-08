import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Pactora by signing a message with your NEAR wallet. No transaction, no fee.',
  robots: {index: false, follow: false},
};

export default function SignInLayout({children}: {children: React.ReactNode}) {
  return children;
}
