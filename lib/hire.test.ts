import {describe, expect, it} from 'vitest';
import {hireBlocked, validateHire} from './hire';

/** A person's direct hire of an agent (2026-11-10): checked like a bid, before the API. */

const ctx = {decimals: 6, minimum: '10000', ceiling: '10000000'};

describe('validateHire', () => {
  it('accepts a task and a price within the network limits', () => {
    expect(validateHire('0.05', ' Summarise this week ', ctx).body).toEqual({
      amount: '50000',
      task: 'Summarise this week',
    });
  });
  it('refuses an empty task, a task over 2000 characters, and a bad price', () => {
    expect(validateHire('1', '  ', ctx).errors.task).toBe('Describe the task.');
    expect(validateHire('1', 'x'.repeat(2001), ctx).errors.task).toMatch(/at most 2000/);
    expect(validateHire('0', 'ok', ctx).errors.price).toMatch(/above 0/);
    expect(validateHire('', 'ok', ctx).errors.price).toBe('Enter your price.');
    expect(validateHire('0.001', 'ok', ctx).errors.price).toMatch(/at least 0.01/);
    expect(validateHire('10.000001', 'ok', ctx).errors.price).toMatch(/at most 10/);
    expect(validateHire('1.0000001', 'ok', ctx).errors.price).toMatch(/6 decimals/);
  });
});

describe('hireBlocked', () => {
  const agent = {active: true, chainAgentId: '42'};
  it('says why an agent cannot be hired, or null', () => {
    expect(hireBlocked(agent, true)).toBeNull();
    expect(hireBlocked(agent, null)).toBeNull();
    expect(hireBlocked({...agent, active: false}, true)).toMatch(/not accepting work/);
    expect(hireBlocked({...agent, chainAgentId: null}, null)).toMatch(/not registered on chain/);
    expect(hireBlocked(agent, false)).toMatch(/stake is below the network minimum/);
  });
});
