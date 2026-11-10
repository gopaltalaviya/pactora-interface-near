import {describe, expect, it} from 'vitest';
import {deliveryLine, parseKinds, savedSummary, type Delivery} from './keys';

/**
 * The webhook and record shapes of the API (routes/webhooks.ts, routes/agents.ts
 * PATCH), in words (2026-11-10). The page crashed on `kinds` and printed
 * "Saved: undefined" for a reply without a name.
 */

describe('parseKinds', () => {
  it('reads a comma or space separated list, without repeats; empty means every kind', () => {
    expect(parseKinds('job.settled, job.message job.settled')).toEqual({
      kinds: ['job.settled', 'job.message'],
      problem: null,
    });
    expect(parseKinds('  ')).toEqual({kinds: [], problem: null});
  });
  it('refuses what the API would refuse', () => {
    expect(parseKinds('Job.Settled').problem).toMatch(/not an event kind/);
    expect(parseKinds(Array.from({length: 51}, (_, i) => `k${i}`).join(',')).problem).toMatch(/50/);
  });
});

describe('deliveryLine', () => {
  const when = (iso: string) => iso.slice(0, 10);
  const base: Delivery = {
    deliveryId: 'd',
    seq: 2,
    status: 'pending',
    attempts: 2,
    lastStatus: 503,
    lastError: 'HTTP 503',
    nextAttemptAt: '2026-11-10T10:00:00.000Z',
    deliveredAt: null,
  };
  it('says the status, attempts, the last answer and what comes next', () => {
    expect(deliveryLine(base, when)).toBe(
      '#2 · pending · 2 attempts · last answer 503 · HTTP 503 · next attempt 2026-11-10',
    );
    expect(
      deliveryLine(
        {
          ...base,
          seq: 1,
          status: 'delivered',
          attempts: 1,
          lastStatus: 200,
          lastError: null,
          nextAttemptAt: null,
          deliveredAt: '2026-11-09T00:00:00.000Z',
        },
        when,
      ),
    ).toBe('#1 · delivered · 1 attempt · last answer 200 · delivered 2026-11-09');
    expect(deliveryLine({...base, lastStatus: null, lastError: null}, when)).toContain('no answer yet');
  });
});

describe('savedSummary', () => {
  const price = (b: string) => `${b} u`;
  it('names the agent as the API confirms it', () => {
    expect(savedSummary({agentId: 7, name: 'Bot', pricePerTask: '5', active: false}, 'Bot', price)).toBe(
      'Now named Bot; 5 u a task; not accepting work.',
    );
  });
  it('never says undefined when the reply has no name', () => {
    const s = savedSummary({agentId: 7, pricePerTask: '5', active: true}, 'Quiet', price);
    expect(s).not.toContain('undefined');
    expect(s).toContain('the API did not confirm the name');
    expect(savedSummary({agentId: 7, pricePerTask: '5', active: true}, undefined, price)).toBe(
      'Saved; 5 u a task; accepting work.',
    );
  });
});
