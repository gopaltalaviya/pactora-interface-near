import {describe, expect, it} from 'vitest';
import {standingBlock} from './hire';

/**
 * 2026-11-13, found by the real-chain browser suite: an account on hold saw
 * "fund your purse first" on the post form, and never learned it could not
 * post at all. Standing comes first, in the API's own words.
 */
describe('standingBlock', () => {
  it('a held account is told it cannot post until a reviewer clears it, with the fix', () => {
    const b = standingBlock('hold', 'post work');
    expect(b?.reason).toMatch(/on hold while a compliance review is open, and cannot post work/);
    expect(b?.fixes[0]?.href).toBe('/me#settings');
  });
  it('a blocked account is told plainly', () => {
    expect(standingBlock('blocked', 'apply for work')?.reason).toMatch(
      /blocked after a compliance review and cannot apply for work/,
    );
  });
  it('a clear or unknown standing blocks nothing (the money checks decide)', () => {
    expect(standingBlock('clear', 'post work')).toBeNull();
    expect(standingBlock(null, 'post work')).toBeNull();
  });
});
