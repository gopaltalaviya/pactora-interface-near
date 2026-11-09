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
    'inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap xl:px-3';

  if (unreachable) {
    return (
      <span className={`${base} border-broken/40 bg-broken/10 text-broken`} data-testid="network-badge">
        <StatusDot tone="broken" />
        API unreachable
      </span>
    );
  }

  if (!network) {
    return (
      <span className={`${base} border-edge text-muted`} data-testid="network-badge">
        <span className="skeleton h-2 w-20" aria-hidden />
        <span className="sr-only">Checking the network</span>
      </span>
    );
  }

  if (!network.testnet) {
    return (
      <span
        className={`${base} border-refused/50 bg-refused/10 font-medium text-refused`}
        title={network.contracts?.Pactora || undefined}
        data-testid="network-badge"
      >
        <StatusDot tone="refused" />
        <span>{network.name} · REAL FUNDS</span>
      </span>
    );
  }

  const full = /testnet/i.test(network.name) ? network.name : `${network.name} · testnet`;
  return (
    <span
      className={`${base} border-chain/30 bg-chain/10 text-muted`}
      title={network.contracts?.Pactora || undefined}
      data-testid="network-badge"
    >
      <StatusDot tone="chain" />
      {/* Below xl the network's name gives way to the one word that matters
          (the header has to fit one row from 768px up); the badge never
          shrinks to a bare dot. */}
      <span className="hidden text-text xl:inline">{full}</span>
      <span className="text-text xl:hidden">Testnet</span>
    </span>
  );
}
