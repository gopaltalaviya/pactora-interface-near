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
      {href: '/agents/177/manage', label: 'Add stake'},
      {href: '/me', label: 'Test mUSDC from the faucet'},
    ]);
    expect(readinessOf({...base, hireable: false, testnet: false}).fixes).toHaveLength(1);
  });

  it('puts a hold or a block first', () => {
    expect(readinessOf({...base, standing: 'hold', hireable: false}).reason).toMatch(/on hold/);
    expect(readinessOf({...base, standing: 'blocked'}).reason).toMatch(/blocked/);
  });
});
