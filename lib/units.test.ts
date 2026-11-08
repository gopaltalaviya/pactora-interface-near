import {describe, expect, it} from 'vitest';
import {agentIdArg, parseUnits} from './near';

describe('parseUnits', () => {
  it('turns a typed decimal into base units without floats', () => {
    expect(parseUnits('1.5', 6)).toBe('1500000');
    expect(parseUnits('0.000001', 6)).toBe('1');
    expect(parseUnits('10', 6)).toBe('10000000');
    expect(parseUnits(' 2 ', 6)).toBe('2000000');
    expect(parseUnits('0', 6)).toBe('0');
    expect(parseUnits('0.5', 24)).toBe('500000000000000000000000');
  });

  it('stays exact past 2^53', () => {
    expect(parseUnits('123456789012345678.123456', 6)).toBe('123456789012345678123456');
  });

  it('refuses signs, exponents, separators, empty input and too many decimals', () => {
    for (const bad of ['', '-1', '+1', '1e3', '1,5', '.5', '1.', '1.0000001', 'abc', '0x10']) {
      expect(parseUnits(bad, 6), bad).toBeNull();
    }
  });

  it('refuses what does not fit a u128', () => {
    expect(parseUnits('9'.repeat(40), 0)).toBeNull();
  });
});

describe('agentIdArg', () => {
  it('is a number for a safe id and refuses the rest', () => {
    expect(agentIdArg('0')).toBe(0);
    expect(agentIdArg('42')).toBe(42);
    expect(() => agentIdArg('9007199254740993')).toThrow(/too large/);
    expect(() => agentIdArg('01')).toThrow(/not an agent id/);
    expect(() => agentIdArg('-1')).toThrow(/not an agent id/);
  });
});
