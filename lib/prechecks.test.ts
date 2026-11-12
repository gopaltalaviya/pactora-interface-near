import {describe, expect, it} from 'vitest';
import type {NetworkInfo} from './api';
import {bondOf, disputeBondOf, feeOf, spendSummary, workerBondOf, workerGets, workSummary} from './fees';
import {bondBlocked, disputeBlocked, postBlocked, spendBlocked, STORAGE_PER_JOB_YOCTO} from './hire';
import {nextStep} from './job-deadlines';

/**
 * The money pre-checks (2026-11-12): before any spend, what the contract
 * would refuse is said in words with its fix, and the button stays off. Each
 * case mirrors a refusal in pactora-contracts-near (InsufficientBalance,
 * PerTaskCapExceeded, DailyCapExceeded, InsufficientStorage, InsufficientBond).
 */

const ctx = {
  decimals: 6,
  symbol: 'mUSDC',
  chainAgentId: '177',
  testnet: true,
  nowMs: Date.UTC(2026, 10, 12, 9),
};
const purse = {balance: '5000000', per_task_cap: '3000000', daily_remaining: '4000000', next_release_at: 0};
const storage = '90000000000000000000000';

const n = {
  paymentToken: {symbol: 'mUSDC', decimals: 6, accountId: 'musdc.testnet'},
  protocolFeeBps: 100,
  minFee: '100',
  bondBps: 2000,
  minBond: '10000',
  disputeBondBps: 1000,
  minDisputeBond: '10000',
  windows: {accept: 600, work: 1800, review: 600, dispute: 3600},
} as NetworkInfo;

describe('the contract’s shares (moved from the job page to lib/fees.ts)', () => {
  it('takes the share, never below the floor, rounding down', () => {
    expect(bondOf('1000000', 2000, '10000')).toBe(200000n);
    expect(bondOf('20000', 2000, '10000')).toBe(10000n);
    expect(bondOf('1000000', undefined, '10000')).toBeNull();
    expect(feeOf('4000000', n)).toBe(40000n);
    expect(workerBondOf('1000000', n)).toBe(200000n);
    expect(disputeBondOf('1000000', n)).toBe(100000n);
    expect(workerGets('4000000', 40000n)).toBe(3960000n);
    expect(workerGets('50', 100n)).toBe(0n);
  });

  it('summarises a spend before it is signed: locked, fee from the worker, bonds, windows', () => {
    const rows = Object.fromEntries(spendSummary('4000000', n).map((r) => [r.id, r.value]));
    expect(rows).toEqual({
      locked: '4 mUSDC',
      fee: '0.04 mUSDC',
      receives: '3.96 mUSDC',
      bond: '0.8 mUSDC',
      disputeBond: '0.4 mUSDC',
      windows:
        'Once it is funded: 10 minutes to accept, then 30 minutes to deliver, then 10 minutes for the client to review.',
    });
    const work = Object.fromEntries(workSummary('4000000', n).map((r) => [r.id, r.value]));
    expect(work).toMatchObject({receives: '3.96 mUSDC', fee: '0.04 mUSDC', bond: '0.8 mUSDC'});
  });
});

describe('spendBlocked: a hire or a funding the purse cannot pay', () => {
  it('passes what the purse, the caps and the storage cover', () => {
    expect(spendBlocked('3000000', purse, storage, ctx)).toBeNull();
  });

  it('says a short purse, by how much, with the fund page and the faucet', () => {
    const b = spendBlocked('6000000', {...purse, per_task_cap: '9000000'}, storage, ctx)!;
    expect(b.reason).toBe(
      'Your purse holds 5 mUSDC, and this job needs 6 mUSDC. Add at least 1 mUSDC to your purse first.',
    );
    expect(b.fixes).toEqual([
      {href: '/agents/177/manage#fund-card', label: 'Fund your purse'},
      {href: '/me#faucet', label: 'Test mUSDC from the faucet'},
    ]);
  });

  it('says the per-task cap, then the daily allowance with when more frees up', () => {
    expect(spendBlocked('3500000', purse, storage, ctx)!.reason).toMatch(
      /above your per-task cap of 3 mUSDC/,
    );
    const at = Date.UTC(2026, 10, 12, 14) / 1000;
    const daily = spendBlocked(
      '3000000',
      {...purse, daily_remaining: '1000000', next_release_at: at},
      storage,
      ctx,
    )!;
    expect(daily.reason).toBe(
      'You can spend 1 mUSDC more in the current 24 hours, and this job needs 3 mUSDC. More frees up at 14:00 UTC. Or raise your daily cap.',
    );
    expect(daily.fixes[0]!.href).toBe('/agents/177/manage#caps-card');
  });

  it('says storage too thin for a new job', () => {
    const b = spendBlocked('1000000', purse, (STORAGE_PER_JOB_YOCTO - 1n).toString(), ctx)!;
    expect(b.reason).toMatch(/a new job needs about 0.005 NEAR/);
    expect(b.fixes[0]!.href).toBe('/agents/177/manage#storage-card');
  });

  it('blocks nothing on what could not be read', () => {
    expect(spendBlocked('9000000000', null, null, ctx)).toBeNull();
  });
});

describe('postBlocked: a listing the API would refuse to reserve', () => {
  it('compares workers × ceiling with the daily allowance and the purse, and the ceiling with the cap', () => {
    expect(postBlocked('2000000', 2, purse, ctx)).toBeNull();
    expect(postBlocked('3500000', 1, purse, ctx)!.reason).toMatch(/above your per-task cap/);
    expect(postBlocked('2000000', 3, {...purse, balance: '9000000'}, ctx)!.reason).toBe(
      'A listing for 3 workers at this ceiling reserves 6 mUSDC of your daily allowance, and 4 mUSDC is left in the current 24 hours. Ask for fewer workers, lower the ceiling, or raise your daily cap.',
    );
    expect(postBlocked('2000000', 2, {...purse, balance: '1000000'}, ctx)!.reason).toMatch(
      /your purse holds 1 mUSDC. Fund your purse with at least 3 mUSDC first/,
    );
  });
});

describe('bondBlocked and disputeBlocked', () => {
  it('a bond the unlocked stake does not cover, or the caps do not allow', () => {
    expect(bondBlocked(200000n, {unlocked: '1000000'}, purse, ctx)).toBeNull();
    expect(bondBlocked(2000000n, {unlocked: '1000000'}, purse, ctx)!.fixes[0]).toEqual({
      href: '/agents/177/manage#stake-card',
      label: 'Add stake',
    });
    expect(bondBlocked(3500000n, {unlocked: '9000000'}, purse, ctx)!.reason).toMatch(/per-task cap/);
    expect(bondBlocked(null, {unlocked: '0'}, purse, ctx)).toBeNull();
  });

  it('a dispute bond the purse cannot pay', () => {
    expect(disputeBlocked(100000n, purse, ctx)).toBeNull();
    expect(disputeBlocked(100000n, {...purse, balance: '40000'}, ctx)!.reason).toBe(
      'Disputing takes a bond of 0.1 mUSDC from your purse, which holds 0.04 mUSDC. Add at least 0.06 mUSDC first.',
    );
  });
});

describe('nextStep: who acts next, and what happens if nobody does', () => {
  it('names the party, the deadline and the default', () => {
    const d = {acceptBy: 'a', workBy: 'w', reviewBy: 'r', disputeBy: 'd'};
    expect(nextStep({state: 'created', chainJobId: null})!.text).toMatch(/client signs to fund/);
    expect(nextStep({state: 'created', chainJobId: '1', deadlines: d})).toEqual({
      by: 'a',
      text: 'Next: the worker accepts the job. If nobody accepts in time, the client is refunded in full.',
    });
    expect(nextStep({state: 'accepted', chainJobId: '1', deadlines: d})!.text).toMatch(
      /receives the worker’s bond/,
    );
    expect(nextStep({state: 'submitted', chainJobId: '1', deadlines: d})!.by).toBe('r');
    expect(nextStep({state: 'disputed', chainJobId: '1', deadlines: null})!.by).toBeNull();
    expect(nextStep({state: 'settled', chainJobId: '1'})).toBeNull();
  });
});
