import {describe, expect, it} from 'vitest';
import {displayAccount, formatYocto, isAccountId, subAccount} from './near';

describe('isAccountId (nearcore rule)', () => {
  it('accepts named, sub- and implicit accounts', () => {
    for (const id of [
      'alice.testnet',
      'bot.alice.testnet',
      'a-b_c.near',
      'ab',
      'pactora.testnet',
      '98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de',
    ])
      expect(isAccountId(id), id).toBe(true);
  });

  it('refuses hex addresses, capitals, bad separators and the wrong length', () => {
    for (const id of [
      '0x0000000000000000000000000000000000000001'.toUpperCase(),
      'Alice.testnet',
      'a',
      'alice..testnet',
      '.alice',
      'alice.',
      'alice-.testnet',
      'al ice.testnet',
      `${'a'.repeat(60)}.near`,
      '',
    ])
      expect(isAccountId(id), id).toBe(false);
  });
});

describe('subAccount', () => {
  it('builds <name>.<owner>', () => {
    expect(subAccount('research-bot', 'alice.testnet')).toBe('research-bot.alice.testnet');
  });

  it('refuses a name that is not one account-id segment', () => {
    expect(() => subAccount('Research', 'alice.testnet')).toThrow(/lowercase/);
    expect(() => subAccount('a.b', 'alice.testnet')).toThrow(/lowercase/);
    expect(() => subAccount('', 'alice.testnet')).toThrow(/lowercase/);
  });

  it('refuses a result longer than 64 characters', () => {
    expect(() =>
      subAccount('bot', '98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de'),
    ).toThrow(/64/);
  });
});

describe('displayAccount', () => {
  it('shows a named account in full, however long', () => {
    expect(displayAccount('research-bot.alice.testnet')).toBe('research-bot.alice.testnet');
    expect(displayAccount('pactora.testnet')).toBe('pactora.testnet');
  });

  it('shortens only a 64-hex implicit account, in the middle', () => {
    expect(displayAccount('98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de')).toBe(
      '98793cd9…f0dbd6de',
    );
  });
});

describe('formatYocto', () => {
  it('reads yoctoNEAR (24 decimals) as NEAR', () => {
    expect(formatYocto('1000000000000000000000000')).toBe('1');
    expect(formatYocto('2500000000000000000000000')).toBe('2.5');
    expect(formatYocto('0')).toBe('0');
  });

  it('keeps four decimals at most, rounding down', () => {
    expect(formatYocto('123456789000000000000000')).toBe('0.1234');
    expect(formatYocto('1')).toBe('0');
  });
});
