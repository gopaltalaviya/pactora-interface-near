'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {Notice} from '@/components/ui/States';
import {rpcOf, viewCall, type PurseView, type StakeView} from '@/lib/chain';
import {workerBondOf} from '@/lib/fees';
import {bondBlocked, type Fix, type PurseFacts, type StakeFacts} from '@/lib/hire';
import {kyc, type Standing} from '@/lib/kyc';
import {manageHref} from '@/lib/links';
import {agentIdArg} from '@/lib/near';
import {useSession} from '@/lib/session';
import type {TokenInfo} from './hooks';

/**
 * Whether the signed-in person can be hired now, before they bid or claim
 * (2026-11-10, item 7). What says no is read, not guessed:
 *
 * - standing: on hold or blocked (GET /v1/kyc);
 * - the chain: `stake_of(...).hireable === false`, the contract's own word
 *   (the API selects nobody it reports so);
 * - the money (2026-11-12): accepting at the price bid locks the network's
 *   bond from the unlocked stake and counts it against the purse's caps, so
 *   a bid the worker could never accept is stopped here, with the fix.
 *
 * Only a definite "no" blocks. A chain or API that cannot be read blocks
 * nothing: the API and the contract still refuse, with their own reason.
 */

export type {Fix};

export interface Readiness {
  /** Why this person cannot be hired now, or null. */
  reason: string | null;
  fixes: Fix[];
}

/** The sentence and the links for what was read. Pure, so it is tested without a browser. */
export function readinessOf(input: {
  standing: Standing | null;
  hireable: boolean | null;
  chainAgentId: string | null;
  testnet: boolean;
  /** The bond at the price bid, with what covers it; absent: not checked. */
  bond?: {
    amount: bigint | null;
    stake: StakeFacts | null;
    purse: PurseFacts | null;
    decimals: number;
    symbol?: string;
  };
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
    if (input.chainAgentId)
      fixes.push({href: `${manageHref(input.chainAgentId)}#stake-card`, label: 'Add stake'});
    if (input.testnet) fixes.push({href: '/me#faucet', label: 'Test mUSDC from the faucet'});
    return {
      reason:
        'You are not hireable yet: your stake is below the network minimum, so a client could not select you. Add stake, then bid.',
      fixes,
    };
  }
  if (input.bond) {
    const b = input.bond;
    const blocked = bondBlocked(b.amount, b.stake, b.purse, {
      decimals: b.decimals,
      ...(b.symbol ? {symbol: b.symbol} : {}),
      chainAgentId: input.chainAgentId,
      testnet: input.testnet,
    });
    if (blocked) return blocked;
  }
  return {reason: null, fixes: []};
}

/**
 * `price` is the bid in base units (null: not typed yet, so the bond is not
 * checked); for a claim, the listing's ceiling.
 */
/** The signed-in person's compliance standing (GET /v1/kyc); null until read or when signed out. */
export function useStanding(): Standing | null {
  const {status, person, authed} = useSession();
  const [standing, setStanding] = useState<Standing | null>(null);
  useEffect(() => {
    setStanding(null);
    if (status !== 'in' || !person) return;
    const controller = new AbortController();
    authed((t) => kyc.state(t, controller.signal))
      .then((s) => setStanding(s.standing))
      .catch(() => undefined);
    return () => controller.abort();
  }, [status, person, authed]);
  return standing;
}

export function useBidReadiness(token: TokenInfo | null, price: string | null = null): Readiness {
  const {status, person, authed} = useSession();
  const [standing, setStanding] = useState<Standing | null>(null);
  const [stake, setStake] = useState<StakeView | null>(null);
  const [purse, setPurse] = useState<PurseView | null>(null);
  const chainAgentId = person?.chainAgentId ?? null;
  const pactora = token?.network.contracts?.Pactora ?? null;
  const rpc = token ? rpcOf(token.network) : null;

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
    setStake(null);
    setPurse(null);
    if (status !== 'in' || !chainAgentId || !pactora || !rpc) return;
    const controller = new AbortController();
    const args = {agent_id: agentIdArg(chainAgentId)};
    viewCall<StakeView | null>(rpc, pactora, 'stake_of', args, controller.signal)
      .then((s) => {
        if (s && typeof s === 'object' && typeof s.hireable === 'boolean') setStake(s);
      })
      .catch(() => undefined);
    viewCall<PurseView | null>(rpc, pactora, 'purse_of', args, controller.signal)
      .then((p) => {
        if (p && typeof p === 'object' && typeof p.balance === 'string') setPurse(p);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [status, chainAgentId, pactora, rpc]);

  const network = token?.network;
  return readinessOf({
    standing,
    hireable: stake ? stake.hireable : null,
    chainAgentId,
    testnet: network?.testnet === true,
    ...(network && price
      ? {
          bond: {
            amount: workerBondOf(price, network),
            stake: stake && typeof stake.unlocked === 'string' ? stake : null,
            purse,
            decimals: network.paymentToken.decimals,
            symbol: network.paymentToken.symbol,
          },
        }
      : {}),
  });
}

/** The reason and its links, above a disabled form or button. */
export function NotReady({readiness, testId = 'bid-not-ready'}: {readiness: Readiness; testId?: string}) {
  if (!readiness.reason) return null;
  return (
    <Notice>
      <p data-testid={testId} role="status">
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
