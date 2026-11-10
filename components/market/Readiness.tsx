'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {Notice} from '@/components/ui/States';
import {viewCall, type StakeView} from '@/lib/chain';
import {kyc, type Standing} from '@/lib/kyc';
import {manageHref} from '@/lib/links';
import {agentIdArg} from '@/lib/near';
import {useSession} from '@/lib/session';
import type {TokenInfo} from './hooks';

/**
 * Whether the signed-in person can be hired now, before they bid or claim
 * (2026-11-10, item 7). Two things say no, and both are read, not guessed:
 *
 * - standing: on hold or blocked (GET /v1/kyc);
 * - the chain: `stake_of(...).hireable === false`, the contract's own word
 *   (the API selects nobody it reports so).
 *
 * Only a definite "no" blocks. A chain or API that cannot be read blocks
 * nothing: the API and the contract still refuse, with their own reason.
 */

export interface Fix {
  href: string;
  label: string;
}

export interface Readiness {
  /** Why this person cannot be hired now, or null. */
  reason: string | null;
  fixes: Fix[];
}

const DEFAULT_RPC = 'https://rpc.testnet.near.org';

/** The sentence and the links for what was read. Pure, so it is tested without a browser. */
export function readinessOf(input: {
  standing: Standing | null;
  hireable: boolean | null;
  chainAgentId: string | null;
  testnet: boolean;
}): Readiness {
  if (input.standing === 'hold' || input.standing === 'blocked') {
    return {
      reason:
        input.standing === 'hold'
          ? 'Your account is on hold, so you cannot be hired until a reviewer clears it.'
          : 'Your account is blocked, so you cannot be hired.',
      fixes: [{href: '/me#settings', label: 'Your identity check'}],
    };
  }
  if (input.hireable === false) {
    const fixes: Fix[] = [];
    if (input.chainAgentId) fixes.push({href: manageHref(input.chainAgentId), label: 'Add stake'});
    if (input.testnet) fixes.push({href: '/me', label: 'Test mUSDC from the faucet'});
    return {
      reason:
        'You are not hireable yet: your stake is below the network minimum, so a client could not select you. Add stake, then bid.',
      fixes,
    };
  }
  return {reason: null, fixes: []};
}

export function useBidReadiness(token: TokenInfo | null): Readiness {
  const {status, person, authed} = useSession();
  const [standing, setStanding] = useState<Standing | null>(null);
  const [hireable, setHireable] = useState<boolean | null>(null);
  const chainAgentId = person?.chainAgentId ?? null;
  const pactora = token?.network.contracts?.Pactora ?? null;
  const rpc = token?.network.rpcUrls?.[0] ?? DEFAULT_RPC;

  useEffect(() => {
    setStanding(null);
    if (status !== 'in' || !person) return;
    const controller = new AbortController();
    authed((t) => kyc.state(t, controller.signal))
      .then((s) => setStanding(s.standing))
      .catch(() => undefined);
    return () => controller.abort();
  }, [status, person, authed]);

  useEffect(() => {
    setHireable(null);
    if (status !== 'in' || !chainAgentId || !pactora) return;
    const controller = new AbortController();
    viewCall<StakeView | null>(
      rpc,
      pactora,
      'stake_of',
      {agent_id: agentIdArg(chainAgentId)},
      controller.signal,
    )
      .then((s) => {
        if (s && typeof s === 'object' && s.hireable === false) setHireable(false);
        else if (s && s.hireable === true) setHireable(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [status, chainAgentId, pactora, rpc]);

  return readinessOf({standing, hireable, chainAgentId, testnet: token?.network.testnet === true});
}

/** The reason and its links, above a disabled bid form or Claim button. */
export function NotReady({readiness}: {readiness: Readiness}) {
  if (!readiness.reason) return null;
  return (
    <Notice>
      <p data-testid="bid-not-ready">
        {readiness.reason}
        {readiness.fixes.map((f) => (
          <span key={f.href}>
            {' '}
            <Link href={f.href} className="underline">
              {f.label}
            </Link>
            .
          </span>
        ))}
      </p>
    </Notice>
  );
}
