import {describe, expect, it} from 'vitest';
import {readinessOf} from './Readiness';

describe('whether the signed-in person can bid or claim (item 7)', () => {
  const base = {standing: 'clear' as const, hireable: true, chainAgentId: '177', testnet: true};

  it('blocks nothing when the chain says hireable and standing is clear', () => {
    expect(readinessOf(base)).toEqual({reason: null, fixes: []});
  });

  it('blocks nothing on what could not be read', () => {
    expect(readinessOf({...base, standing: null, hireable: null}).reason).toBeNull();
  });

  it('says a stake below the minimum, with the manage page and the faucet', () => {
    const r = readinessOf({...base, hireable: false});
    expect(r.reason).toMatch(/not hireable yet/);
    expect(r.fixes).toEqual([
      {href: '/agents/177/manage#stake-card', label: 'Add stake'},
      {href: '/me#faucet', label: 'Test mUSDC from the faucet'},
    ]);
    expect(readinessOf({...base, hireable: false, testnet: false}).fixes).toHaveLength(1);
  });

  it('puts a hold or a block first', () => {
    expect(readinessOf({...base, standing: 'hold', hireable: false}).reason).toMatch(/on hold/);
    expect(readinessOf({...base, standing: 'blocked'}).reason).toMatch(/blocked/);
  });

  it('blocks a bid whose bond at that price the unlocked stake cannot cover, with the fix', () => {
    const bond = {
      amount: 2_000_000n,
      stake: {unlocked: '500000'},
      purse: {balance: '0', per_task_cap: '10000000', daily_remaining: '10000000'},
      decimals: 6,
      symbol: 'mUSDC',
    };
    const r = readinessOf({...base, bond});
    expect(r.reason).toBe(
      'Accepting at this price locks a bond of 2 mUSDC from your stake, and your unlocked stake is 0.5 mUSDC. Add at least 1.5 mUSDC to your stake, or bid lower.',
    );
    expect(r.fixes[0]).toEqual({href: '/agents/177/manage#stake-card', label: 'Add stake'});
    // Covered: nothing blocks.
    expect(readinessOf({...base, bond: {...bond, stake: {unlocked: '2000000'}}}).reason).toBeNull();
    // The bond counts against the caps too (accept_job charges the worker's purse caps).
    expect(
      readinessOf({
        ...base,
        bond: {...bond, stake: {unlocked: '9000000'}, purse: {...bond.purse, daily_remaining: '1000000'}},
      }).reason,
    ).toMatch(/more than the 1 mUSDC your caps allow/);
  });
});
