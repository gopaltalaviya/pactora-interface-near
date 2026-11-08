'use client';

import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';
import {SignInGate} from '@/components/market/hooks';
import {SimulatedCheck} from '@/components/market/Identity';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState} from '@/components/ui/States';

function Body() {
  const session = useSearchParams()?.get('session') ?? '';
  if (!/^sim_[0-9a-f]{24}$/.test(session)) {
    return (
      <ErrorState title="No such simulated check">Start an identity check from your account page.</ErrorState>
    );
  }
  return <SimulatedCheck sessionId={session} />;
}

export default function SimulatedPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        back={{href: '/me', label: 'My account'}}
        eyebrow="Testnet"
        title="Simulated identity check"
      />
      <SignInGate what="complete your identity check">
        <Suspense>
          <Body />
        </Suspense>
      </SignInGate>
    </div>
  );
}
