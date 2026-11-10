import {describe, expect, it} from 'vitest';
import {KEEPER_LINE, deadlineRows, duration, windowsText} from './job-deadlines';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const deadlines = {
  acceptBy: '2026-11-10T11:00:00.000Z',
  workBy: '2026-11-10T13:00:00.000Z',
  reviewBy: null,
  disputeBy: null,
};

describe('deadlineRows', () => {
  it('lists the deadlines the API gave, marks the passed ones and the one that applies now', () => {
    const rows = deadlineRows({state: 'accepted', chainJobId: '5', deadlines}, NOW);
    expect(rows.map((r) => [r.label, r.passed, r.current])).toEqual([
      ['Accept by', true, false],
      ['Deliver by', false, true],
    ]);
    expect(rows[1]!.at).toBe('2026-11-10T13:00:00.000Z');
  });

  it('says nothing for a closed job, a job not on chain, or an API without the field', () => {
    expect(deadlineRows({state: 'settled', chainJobId: '5', deadlines}, NOW)).toEqual([]);
    expect(deadlineRows({state: 'created', chainJobId: null, deadlines}, NOW)).toEqual([]);
    expect(deadlineRows({state: 'created', chainJobId: '5'}, NOW)).toEqual([]);
    expect(deadlineRows({state: 'created', chainJobId: '5', deadlines: null}, NOW)).toEqual([]);
  });

  it('a review and a ruling deadline read as such', () => {
    const rows = deadlineRows(
      {
        state: 'disputed',
        chainJobId: '5',
        deadlines: {...deadlines, reviewBy: '2026-11-10T14:00:00Z', disputeBy: '2026-11-10T15:00:00Z'},
      },
      NOW,
    );
    expect(rows.map((r) => r.label)).toEqual(['Accept by', 'Deliver by', 'Review by', 'Ruling due by']);
    expect(rows.find((r) => r.current)?.label).toBe('Ruling due by');
  });
});

describe('the windows, before the job is on chain', () => {
  it('reads the network windows in words', () => {
    expect(windowsText({accept: 600, work: 1800, review: 600, dispute: 3600})).toBe(
      'Once it is funded: 10 minutes to accept, then 30 minutes to deliver, then 10 minutes for the client to review.',
    );
    expect(windowsText(undefined)).toBeNull();
  });

  it('durations', () => {
    expect(duration(60)).toBe('1 minute');
    expect(duration(7200)).toBe('2 hours');
    expect(duration(86400 * 3)).toBe('3 days');
    expect(duration(90)).toBe('90 seconds');
  });

  it('the keeper line says who closes a job that runs out of time, and what happens', () => {
    expect(KEEPER_LINE).toMatch(/keeper/);
    expect(KEEPER_LINE).toMatch(/refunded/);
    expect(KEEPER_LINE).toMatch(/paid to the worker/);
  });
});
