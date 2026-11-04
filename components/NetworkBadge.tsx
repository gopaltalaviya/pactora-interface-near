'use client';

import {useEffect, useState} from 'react';
import {api, type NetworkInfo} from '@/lib/api';
import {StatusDot} from './ui/Badge';

/**
 * Which chain, and whether the funds are real.
 *
 * Deliberately loud when they are. A viewer watching agents spend money is
 * entitled to know in one glance whether it matters, and the honest failure
 * mode is to say nothing rather than to assume testnet — a badge that
 * defaults to "testnet" while the API is unreachable would be a reassuring
 * lie.
 */
export function NetworkBadge() {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    api
      .network()
      .then(setNetwork)
      .catch(() => setUnreachable(true));
  }, []);

  const base =
    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 min-[400px]:px-3 text-xs whitespace-nowrap';

  if (unreachable) {
    return (
      <span className={`${base} border-broken/40 bg-broken/10 text-broken`}>
        <StatusDot tone="broken" />
        API unreachable
      </span>
    );
  }

  if (!network) {
    return (
      <span className={`${base} border-edge text-muted`}>
        <span className="skeleton h-2 w-20" aria-hidden />
        <span className="sr-only">Checking the network</span>
      </span>
    );
  }

  return (
    <span
      className={
        network.testnet
          ? `${base} border-chain/30 bg-chain/10 text-muted`
          : `${base} border-refused/50 bg-refused/10 font-medium text-refused`
      }
      title={network.contracts['TaskEscrow'] ?? undefined}
    >
      <StatusDot tone={network.testnet ? 'chain' : 'refused'} />
      {/* On the narrowest phones a testnet badge is just its dot; REAL FUNDS is never hidden. */}
      <span className={network.testnet ? 'sr-only text-text min-[400px]:not-sr-only' : ''}>
        {network.name}
        {network.testnet ? ' · testnet' : ' · REAL FUNDS'}
      </span>
    </span>
  );
}
