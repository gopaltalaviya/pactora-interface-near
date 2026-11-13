'use client';

import {useEffect, useState} from 'react';
import {Badge} from '@/components/ui/Badge';
import {rpcOf, viewCall, type StakeView} from '@/lib/chain';
import type {NetworkInfo} from '@/lib/api';
import {agentIdArg, formatYocto} from '@/lib/near';

/**
 * Below this, an agent's storage is about to run out: each new job needs a
 * little, and a create_job the contract refuses for storage fails after the
 * signature (live test, 2026-11-13: the demo client hit InsufficientStorage).
 */
export const LOW_STORAGE_YOCTO = 10_000_000_000_000_000_000_000n; // 0.01 NEAR

export type AgentHealth = {hireable: boolean | null; storage: bigint | null};

/** Is a storage balance (yoctoNEAR) low enough to warn about? */
export function storageLow(storage: bigint | null): boolean {
  return storage !== null && storage < LOW_STORAGE_YOCTO;
}

/** An agent's stake and storage, read from the chain in the browser. */
export function useAgentHealth(chainAgentId: string | null, network: NetworkInfo | null): AgentHealth | null {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const pactora = network?.contracts?.Pactora;
  const rpc = network ? rpcOf(network) : null;
  useEffect(() => {
    if (!chainAgentId || !pactora || !rpc) return;
    const c = new AbortController();
    const id = {agent_id: agentIdArg(chainAgentId)};
    Promise.all([
      viewCall<StakeView | null>(rpc, pactora, 'stake_of', id, c.signal).catch(() => null),
      viewCall<string>(rpc, pactora, 'storage_balance_of', id, c.signal).catch(() => null),
    ]).then(([stake, storage]) => {
      if (c.signal.aborted) return;
      setHealth({
        hireable: stake && typeof stake.hireable === 'boolean' ? stake.hireable : null,
        storage: typeof storage === 'string' && /^\d+$/.test(storage) ? BigInt(storage) : null,
      });
    });
    return () => c.abort();
  }, [chainAgentId, pactora, rpc]);
  return health;
}

/** The badges for a row of "My agents": paused, not hireable, low storage. */
export function AgentHealthBadges({active, health}: {active: boolean; health: AgentHealth | null}) {
  return (
    <>
      <Badge tone={active && health?.hireable !== false ? 'settled' : 'refused'}>
        {!active
          ? 'paused'
          : health?.hireable === false
            ? 'not hireable: stake below the minimum'
            : 'accepting work'}
      </Badge>
      {health && storageLow(health.storage) && (
        <span data-testid="storage-low">
          <Badge tone="refused">
            storage low: {formatYocto(health.storage!.toString())} NEAR left; add storage before it runs out
          </Badge>
        </span>
      )}
    </>
  );
}
