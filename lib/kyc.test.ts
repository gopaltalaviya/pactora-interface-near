import {describe, expect, it} from 'vitest';
import {canStart, simulatedSessionOf, validateLegalName, type KycState} from './kyc';

const base: KycState = {
  standing: 'clear',
  provider: {name: 'simulated', simulated: true},
  screening: true,
  walletScreening: 'not available',
  verification: null,
};
const withStatus = (status: NonNullable<KycState['verification']>['status']): KycState => ({
  ...base,
  verification: {
    verificationId: 'v',
    provider: 'simulated',
    status,
    documentVerified: false,
    createdAt: '',
    decidedAt: null,
  },
});

describe('canStart', () => {
  it('only with a provider, not blocked, and nothing running or done', () => {
    expect(canStart(base)).toBe(true);
    expect(canStart({...base, provider: null})).toBe(false);
    expect(canStart({...base, standing: 'blocked'})).toBe(false);
    for (const s of ['pending', 'approved', 'screening'] as const)
      expect(canStart(withStatus(s)), s).toBe(false);
    for (const s of ['rejected', 'expired', 'cancelled_cleared'] as const)
      expect(canStart(withStatus(s)), s).toBe(true);
  });

  it('lets a person whose hold was cleared start, and not one still on hold (live audit 2026-11-09)', () => {
    expect(canStart({...withStatus('held'), standing: 'hold'})).toBe(false);
    expect(canStart({...withStatus('held'), standing: 'clear'})).toBe(true);
  });
});

describe('validateLegalName and simulatedSessionOf', () => {
  it('a legal name is 2-200 characters, trimmed', () => {
    expect(validateLegalName(' A ')).toMatch(/2-200/);
    expect(validateLegalName('Priya Sharma')).toBeNull();
  });
  it('reads only our simulated page and a well-formed session id', () => {
    const id = `sim_${'a1'.repeat(12)}`;
    expect(simulatedSessionOf(`http://localhost:3000/kyc/simulated?session=${id}`)).toBe(id);
    expect(simulatedSessionOf(`https://vendor.example/verify?session=${id}`)).toBeNull();
    expect(simulatedSessionOf('http://localhost:3000/kyc/simulated?session=sim_x')).toBeNull();
    expect(simulatedSessionOf('not a url')).toBeNull();
    expect(simulatedSessionOf(undefined)).toBeNull();
  });
});
