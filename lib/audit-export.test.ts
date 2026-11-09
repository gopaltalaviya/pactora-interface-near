import {describe, expect, it} from 'vitest';
import {auditFilename, auditRange, defaultAuditDates} from './audit-export';

describe('the compliance audit-log export range', () => {
  it('sends the last day chosen as an exclusive end: the next midnight', () => {
    expect(auditRange('2026-10-01', '2026-10-31')).toEqual({ok: true, from: '2026-10-01', to: '2026-11-01'});
    // One day is a valid range.
    expect(auditRange('2026-11-09', '2026-11-09')).toEqual({ok: true, from: '2026-11-09', to: '2026-11-10'});
  });

  it('refuses what the API would refuse with a 422, before asking', () => {
    expect(auditRange('2026-11-09', '2026-11-08')).toMatchObject({ok: false, problem: /on or after/});
    expect(auditRange('2025-01-01', '2026-11-09')).toMatchObject({ok: false, problem: /366 days/});
    expect(auditRange('', '2026-11-09')).toMatchObject({ok: false, problem: /both dates/});
    expect(auditRange('2026-02-30', '2026-03-01')).toMatchObject({ok: false, problem: /both dates/});
    // Exactly 366 days is allowed.
    expect(auditRange('2025-11-09', '2026-11-09')).toMatchObject({ok: true});
  });

  it('defaults to the last 30 days, ending today', () => {
    expect(defaultAuditDates(new Date('2026-11-09T15:00:00Z'))).toEqual({
      from: '2026-10-11',
      to: '2026-11-09',
    });
  });

  it('names the file as the API does, from the dates sent', () => {
    expect(auditFilename('2026-10-01', '2026-11-01')).toBe('pactora-audit-2026-10-01-2026-11-01.csv');
  });
});
