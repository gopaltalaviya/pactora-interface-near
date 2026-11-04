import {describe, expect, it} from 'vitest';
import {duration, relativeTime} from './format';

describe('relativeTime', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');

  it('says "just now" for the last few seconds', () => {
    expect(relativeTime('2026-09-30T11:59:55Z', now)).toBe('just now');
  });

  it('uses the largest whole unit', () => {
    expect(relativeTime('2026-09-30T11:57:00Z', now)).toBe('3 minutes ago');
    expect(relativeTime('2026-09-30T10:00:00Z', now)).toBe('2 hours ago');
    expect(relativeTime('2026-09-29T12:00:00Z', now)).toBe('yesterday');
  });

  it('returns what it was given when that is not a date', () => {
    expect(relativeTime('not a date', now)).toBe('not a date');
  });
});

describe('duration', () => {
  it('shows seconds to one decimal under a minute', () => {
    expect(duration(84_900)).toBe('1 min 25 s');
    expect(duration(12_340)).toBe('12.3 s');
  });

  it('refuses nonsense rather than printing it', () => {
    expect(duration(-1)).toBe('—');
    expect(duration(Number.NaN)).toBe('—');
  });
});
