import {describe, expect, it} from 'vitest';
import {
  activeWeeks,
  amountsText,
  hasHistory,
  ratingPoints,
  type HistoryWeek,
  type ParticipantHistory,
} from './history';
import {runningAverage} from '@/components/market/ScoreChart';

const week = (w: string, extra: Partial<HistoryWeek> = {}): HistoryWeek => ({
  week: w,
  settled: 0,
  refunded: 0,
  asWorker: 0,
  asClient: 0,
  amounts: {lt1: 0, '1to10': 0, '10to100': 0, gte100: 0},
  rating: null,
  ...extra,
});

const history = (series: HistoryWeek[]): ParticipantHistory => ({
  subject: {kind: 'agent', agentId: '1', profileId: null},
  weeks: series.length,
  from: '2026-11-02T00:00:00.000Z',
  to: '2026-11-16T00:00:00.000Z',
  amountBuckets: ['lt1', '1to10', '10to100', 'gte100'],
  series,
  totals: {settled: 0, refunded: 0, rating: null},
});

describe('a participant’s weekly history (GET /v1/agents/:id/history)', () => {
  it('keeps only the weeks something happened in, oldest first', () => {
    const s = [
      week('2026-11-09', {settled: 2}),
      week('2026-10-26'),
      week('2026-11-02', {rating: {average: 4, count: 1}}),
    ];
    expect(activeWeeks(s).map((w) => w.week)).toEqual(['2026-11-02', '2026-11-09']);
  });

  it('has a history only when a job closed or a review was shown', () => {
    expect(hasHistory(history([week('2026-11-02'), week('2026-11-09')]))).toBe(false);
    expect(hasHistory(history([week('2026-11-02', {refunded: 1})]))).toBe(true);
    expect(hasHistory(history([week('2026-11-02', {rating: {average: 5, count: 1}})]))).toBe(true);
  });

  it('turns rated weeks into chart points whose running average is weighted by the review count', () => {
    const pts = ratingPoints([
      week('2026-11-02', {rating: {average: 5, count: 3}}),
      week('2026-11-09'),
      week('2026-11-16', {rating: {average: 1, count: 1}}),
    ]);
    expect(pts.map((p) => [p.at, p.value, p.weight])).toEqual([
      ['2026-11-02', 5, 3],
      ['2026-11-16', 1, 1],
    ]);
    expect(pts[0]!.label).toBe('3 reviews in the week of 2 Nov 2026');
    // (5·3 + 1·1) / 4 = 4, not the unweighted (5 + 1) / 2 = 3.
    expect(runningAverage(pts)).toEqual([5, 4]);
  });

  it('says how big the closed jobs were, in the buckets the API counts', () => {
    expect(amountsText({lt1: 3, '1to10': 1, '10to100': 0, gte100: 0})).toBe('3 under 1, 1 of 1–10');
    expect(amountsText({lt1: 0, '1to10': 0, '10to100': 0, gte100: 2})).toBe('2 of 100 or more');
    expect(amountsText({lt1: 0, '1to10': 0, '10to100': 0, gte100: 0})).toBe('—');
  });
});
