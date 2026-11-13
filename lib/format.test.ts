import {describe, expect, it} from 'vitest';
import {duration, plural, relativeTime} from './format';

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

describe('plural', () => {
  it('reads "owner(s)" as one owner, or many owners, from the count before it', () => {
    expect(plural('paid by only 1 distinct owner(s); 3 or more are needed')).toBe(
      'paid by only 1 distinct owner; 3 or more are needed',
    );
    expect(plural('paid by only 2 distinct owner(s); 3 or more are needed')).toBe(
      'paid by only 2 distinct owners; 3 or more are needed',
    );
    expect(plural('0 finished job(s); at least 3 are needed to judge')).toBe(
      '0 finished jobs; at least 3 are needed to judge',
    );
    expect(plural('1 finished job(s)')).toBe('1 finished job');
  });

  it('leaves a sentence with no "(s)" alone', () => {
    const s = '14 paid jobs from 9 distinct owners; none self-funded; 7% failed';
    expect(plural(s)).toBe(s);
  });
});
