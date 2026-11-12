/**
 * A person hires an agent directly (POST /v1/jobs/hire, 2026-11-10): the
 * form's checks, the same in kind as a bid's (lib/listing-form.ts
 * validateBid): a price parsed with BigInt in token base units, never a
 * float, and a task the API will take. The API checks again; this only keeps
 * a request that can only be refused from being sent.
 */

import {formatUnits} from './api';
import {manageHref} from './links';
import {formatYocto, parseUnits} from './near';

export const TASK_MAX = 2000;

export interface HireContext {
  decimals: number;
  /** The token's symbol, for the messages; optional. */
  symbol?: string;
  /** The network's minJobAmount, base units. */
  minimum: string;
  /** The most one job may hold (maxJobAmount), base units. */
  ceiling: string;
}

const amount = (base: string, ctx: HireContext) =>
  `${formatUnits(base, ctx.decimals)}${ctx.symbol ? ` ${ctx.symbol}` : ''}`;

export function validateHire(
  priceText: string,
  task: string,
  ctx: HireContext,
): {errors: {price?: string; task?: string}; body: {amount: string; task: string} | null} {
  const errors: {price?: string; task?: string} = {};
  const units = parseUnits(priceText, ctx.decimals);
  if (!priceText.trim()) errors.price = 'Enter your price.';
  else if (units === null || /^0+$/.test(units))
    errors.price = `Enter an amount above 0 with at most ${ctx.decimals} decimals.`;
  else if (BigInt(units) < BigInt(ctx.minimum))
    errors.price = `A job holds at least ${amount(ctx.minimum, ctx)}.`;
  else if (BigInt(units) > BigInt(ctx.ceiling))
    errors.price = `A job holds at most ${amount(ctx.ceiling, ctx)}.`;
  const text = task.trim();
  if (!text) errors.task = 'Describe the task.';
  else if (text.length > TASK_MAX) errors.task = `The task is at most ${TASK_MAX} characters.`;
  if (errors.price || errors.task || units === null) return {errors, body: null};
  return {errors, body: {amount: units, task: text}};
}

/**
 * Why an agent cannot be hired now, or null. `hireable` is the chain's
 * `stake_of(..).hireable` — null when it could not be read (the API still checks).
 */
export function hireBlocked(
  agent: {active: boolean; chainAgentId?: string | number | null},
  hireable: boolean | null,
): string | null {
  if (agent.chainAgentId === null || agent.chainAgentId === undefined)
    return 'This agent is not registered on chain yet, so the escrow cannot hold a job for it.';
  if (!agent.active) return 'This agent is not accepting work: its owner paused it.';
  if (hireable === false)
    return 'This agent’s stake is below the network minimum, so the escrow will not hire it until its owner stakes more.';
  return null;
}

// ─── money pre-checks: never ask a wallet to sign what the contract refuses ──

/** A link to the place that fixes a problem. */
export interface Fix {
  href: string;
  label: string;
}

/** Why a spend cannot go through now, and where to fix it. */
export interface MoneyBlock {
  reason: string;
  fixes: Fix[];
}

/** The part of `purse_of` the checks read. Amounts are token base units. */
export interface PurseFacts {
  balance: string;
  per_task_cap: string;
  daily_remaining: string;
  /** When the oldest spend leaves the 24-hour window, unix seconds; 0 when none. */
  next_release_at?: number;
}

/** The part of `stake_of` the bond check reads. */
export interface StakeFacts {
  unlocked: string;
}

/**
 * NEAR (yocto) one new job adds to the client's storage, estimated from the
 * contract's job record (~270 bytes) plus its `JOB_GROWTH_BYTES` (154), at
 * 10^19 yocto a byte, rounded up: 0.005 NEAR. Below this the contract
 * refuses `create_job` with InsufficientStorage.
 */
export const STORAGE_PER_JOB_YOCTO = 5_000_000_000_000_000_000_000n;

export interface MoneyContext {
  decimals: number;
  symbol?: string;
  /** The person's on-chain agent id: the fix links go to its manage page. */
  chainAgentId: string | null;
  /** Testnet: the faucet is offered as a way to get tokens. */
  testnet?: boolean;
  /** "now" for the next-release time, unix ms; injected by tests. */
  nowMs?: number;
}

const U128 = /^\d{1,39}$/;

const money = (base: string | bigint, ctx: {decimals: number; symbol?: string}) =>
  `${formatUnits(base.toString(), ctx.decimals)}${ctx.symbol ? ` ${ctx.symbol}` : ''}`;

const manage = (ctx: MoneyContext, anchor: string, label: string): Fix[] =>
  ctx.chainAgentId ? [{href: `${manageHref(ctx.chainAgentId)}#${anchor}`, label}] : [];

const faucet = (ctx: MoneyContext): Fix[] =>
  ctx.testnet ? [{href: '/me#faucet', label: `Test ${ctx.symbol ?? 'tokens'} from the faucet`}] : [];

/** " More frees up at 14:00 UTC." for a release time, or "" when there is none or it has passed. */
export function releaseText(at: number | undefined, nowMs: number): string {
  if (!at || at * 1000 <= nowMs) return '';
  const d = new Date(at * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const day = d.toISOString().slice(0, 10);
  const sameDay = day === new Date(nowMs).toISOString().slice(0, 10);
  return ` More frees up at ${hh}:${mm} UTC${sameDay ? '' : ` on ${day}`}.`;
}

/**
 * Before a client signs `create_job` (a direct hire, or funding a selected
 * bid): the contract takes `amount` from the purse under its caps (`spend`:
 * InsufficientBalance, PerTaskCapExceeded, DailyCapExceeded) and bills the
 * new job's storage (InsufficientStorage). Null when nothing read says no; a
 * purse that could not be read blocks nothing (the chain still refuses, and
 * its refusal is said in words, lib/errors.ts).
 */
export function spendBlocked(
  amount: string,
  purse: PurseFacts | null,
  storage: string | null,
  ctx: MoneyContext,
): MoneyBlock | null {
  if (!U128.test(amount) || !purse) return null;
  const a = BigInt(amount);
  const balance = BigInt(purse.balance);
  if (a > balance) {
    return {
      reason: `Your purse holds ${money(balance, ctx)}, and this job needs ${money(a, ctx)}. Add at least ${money(a - balance, ctx)} to your purse first.`,
      fixes: [...manage(ctx, 'fund-card', 'Fund your purse'), ...faucet(ctx)],
    };
  }
  if (a > BigInt(purse.per_task_cap)) {
    return {
      reason: `This job is ${money(a, ctx)}, above your per-task cap of ${money(purse.per_task_cap, ctx)}. Raise the cap, or offer less.`,
      fixes: manage(ctx, 'caps-card', 'Raise your spending caps'),
    };
  }
  if (a > BigInt(purse.daily_remaining)) {
    return {
      reason: `You can spend ${money(purse.daily_remaining, ctx)} more in the current 24 hours, and this job needs ${money(a, ctx)}.${releaseText(purse.next_release_at, ctx.nowMs ?? Date.now())} Or raise your daily cap.`,
      fixes: manage(ctx, 'caps-card', 'Raise your daily cap'),
    };
  }
  if (storage !== null && /^\d{1,40}$/.test(storage) && BigInt(storage) < STORAGE_PER_JOB_YOCTO) {
    return {
      reason: `Your record has ${formatYocto(storage)} NEAR for storage, and a new job needs about ${formatYocto(STORAGE_PER_JOB_YOCTO.toString())} NEAR. Add storage first.`,
      fixes: manage(ctx, 'storage-card', 'Add storage'),
    };
  }
  return null;
}

/**
 * Posting a listing reserves (workers × ceiling) of the client's rolling
 * daily allowance, and the API refuses one that does not fit
 * (pactora-backend-near routes/listings.ts checkBudget): the ceiling above
 * the per-task cap, the reservation above what is left today, or above the
 * purse. Other open listings hold part of the allowance too, which this page
 * does not know, so this is the least the API will ask for: a definite no.
 */
export function postBlocked(
  ceiling: string,
  maxWorkers: number,
  purse: PurseFacts | null,
  ctx: MoneyContext,
): MoneyBlock | null {
  if (!U128.test(ceiling) || !purse || !Number.isInteger(maxWorkers) || maxWorkers < 1) return null;
  const one = BigInt(ceiling);
  const all = one * BigInt(maxWorkers);
  const slots = maxWorkers === 1 ? 'one worker' : `${maxWorkers} workers`;
  if (one > BigInt(purse.per_task_cap)) {
    return {
      reason: `This ceiling, ${money(one, ctx)}, is above your per-task cap of ${money(purse.per_task_cap, ctx)}, so Pactora would refuse the listing. Raise the cap, or lower the ceiling.`,
      fixes: manage(ctx, 'caps-card', 'Raise your spending caps'),
    };
  }
  if (all > BigInt(purse.daily_remaining)) {
    return {
      reason: `A listing for ${slots} at this ceiling reserves ${money(all, ctx)} of your daily allowance, and ${money(purse.daily_remaining, ctx)} is left in the current 24 hours.${releaseText(purse.next_release_at, ctx.nowMs ?? Date.now())} Ask for fewer workers, lower the ceiling, or raise your daily cap.`,
      fixes: manage(ctx, 'caps-card', 'Raise your daily cap'),
    };
  }
  if (all > BigInt(purse.balance)) {
    return {
      reason: `A listing for ${slots} at this ceiling reserves ${money(all, ctx)}, and your purse holds ${money(purse.balance, ctx)}. Fund your purse with at least ${money(all - BigInt(purse.balance), ctx)} first, or ask for less.`,
      fixes: [...manage(ctx, 'fund-card', 'Fund your purse'), ...faucet(ctx)],
    };
  }
  return null;
}

/**
 * Before a worker bids or accepts at a price: `accept_job` locks the bond
 * from the unlocked stake (InsufficientBond) and counts it against the
 * worker's own caps (PerTaskCapExceeded, DailyCapExceeded). `bond` is the
 * network's bond at that price (lib/fees.ts workerBondOf).
 */
export function bondBlocked(
  bond: bigint | null,
  stake: StakeFacts | null,
  purse: PurseFacts | null,
  ctx: MoneyContext,
): MoneyBlock | null {
  if (bond === null || bond === 0n) return null;
  if (stake && U128.test(stake.unlocked) && bond > BigInt(stake.unlocked)) {
    return {
      reason: `Accepting at this price locks a bond of ${money(bond, ctx)} from your stake, and your unlocked stake is ${money(stake.unlocked, ctx)}. Add at least ${money(bond - BigInt(stake.unlocked), ctx)} to your stake, or bid lower.`,
      fixes: [...manage(ctx, 'stake-card', 'Add stake'), ...faucet(ctx)],
    };
  }
  if (purse && bond > BigInt(purse.per_task_cap)) {
    return {
      reason: `The bond at this price, ${money(bond, ctx)}, is above your per-task cap of ${money(purse.per_task_cap, ctx)}: the contract counts a bond against your caps. Raise the cap, or bid lower.`,
      fixes: manage(ctx, 'caps-card', 'Raise your spending caps'),
    };
  }
  if (purse && bond > BigInt(purse.daily_remaining)) {
    return {
      reason: `The bond at this price, ${money(bond, ctx)}, is more than the ${money(purse.daily_remaining, ctx)} your caps allow in the current 24 hours.${releaseText(purse.next_release_at, ctx.nowMs ?? Date.now())} Or raise your daily cap.`,
      fixes: manage(ctx, 'caps-card', 'Raise your daily cap'),
    };
  }
  return null;
}

/** Before a client disputes: the dispute bond is taken from the purse, outside the caps. */
export function disputeBlocked(
  bond: bigint | null,
  purse: PurseFacts | null,
  ctx: MoneyContext,
): MoneyBlock | null {
  if (bond === null || bond === 0n || !purse) return null;
  if (bond > BigInt(purse.balance)) {
    return {
      reason: `Disputing takes a bond of ${money(bond, ctx)} from your purse, which holds ${money(purse.balance, ctx)}. Add at least ${money(bond - BigInt(purse.balance), ctx)} first.`,
      fixes: [...manage(ctx, 'fund-card', 'Fund your purse'), ...faucet(ctx)],
    };
  }
  return null;
}
