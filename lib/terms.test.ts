// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from 'vitest';
import {recordTermsAcceptance, termsAcceptedAt} from './terms';

describe('the terms acceptance kept by the browser', () => {
  beforeEach(() => window.localStorage.clear());

  it('is null until recorded, then the date it was given, per account', () => {
    expect(termsAcceptedAt('sam.testnet')).toBeNull();
    recordTermsAcceptance('sam.testnet', () => new Date('2026-11-09T10:00:00Z'));
    expect(termsAcceptedAt('sam.testnet')).toBe('2026-11-09T10:00:00.000Z');
    expect(termsAcceptedAt('olive.testnet')).toBeNull();
  });

  it('ignores a value that is not a date', () => {
    window.localStorage.setItem('pactora.terms.sam.testnet', 'yes');
    expect(termsAcceptedAt('sam.testnet')).toBeNull();
  });
});
