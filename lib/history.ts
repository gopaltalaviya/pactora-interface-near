/**
 * A participant's record week by week (Round 3, 2026-11-09):
 * `GET /v1/agents/:id/history` and `GET /v1/profiles/:id/history`. Types are
 * a copy of the backend's view (pactora-backend-near apps/api), for the
 * reason api.ts gives.
 *
 * Always 52 weeks, oldest first, zero-filled; a week starts Monday 00:00 UTC
 * and the last is the current, partial one. Jobs are counted as client OR
 * worker, by the week they closed; there are no counterparties, job ids or
 * exact amounts, only counts in size buckets. `rating` is the average of the
 * reviews about the participant that are visible now, by the week written.
 */

import {request} from './api';
import type {ScorePoint} from '@/components/market/ScoreChart';

export type AmountBucket = 'lt1' | '1to10' | '10to100' | 'gte100';

export interface WeekRating {
  average: number;
  count: number;
}

export interface HistoryWeek {
  /** The Monday the week starts on, `YYYY-MM-DD`. */
  week: string;
  settled: number;
  refunded: number;
  asWorker: number;
  asClient: number;
  amounts: Record<AmountBucket, number>;
  rating: WeekRating | null;
}

export interface ParticipantHistory {
  subject: {kind: 'agent' | 'person'; agentId: string | null; profileId: string | null};
  weeks: number;
  from: string;
  to: string;
  amountBuckets: AmountBucket[];
  series: HistoryWeek[];
  totals: {settled: number; refunded: number; rating: WeekRating | null};
}

const enc = encodeURIComponent;

export const history = {
  agent: (agentId: number, signal?: AbortSignal) =>
    request<ParticipantHistory>(
      `/v1/agents/${agentId}/history`,
      signal ? {signal} : {},
      'could not load the record over time',
    ),
  profile: (profileId: string, signal?: AbortSignal) =>
    request<ParticipantHistory>(
      `/v1/profiles/${enc(profileId)}/history`,
      signal ? {signal} : {},
      'could not load the record over time',
    ),
};

/** "2 Nov 2026", for a week's Monday. */
export function weekText(week: string): string {
  const d = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return week;
  return `${d.getUTCDate()} ${d.toLocaleString('en', {month: 'short', timeZone: 'UTC'})} ${d.getUTCFullYear()}`;
}

const happened = (w: HistoryWeek) => w.settled > 0 || w.refunded > 0 || w.rating !== null;

/** The weeks something happened in, oldest first: the table leaves the empty ones out. */
export function activeWeeks(series: HistoryWeek[]): HistoryWeek[] {
  return series.filter(happened).sort((a, b) => a.week.localeCompare(b.week));
}

/** Whether there is anything to chart: a job closed, or a review is shown. */
export function hasHistory(h: ParticipantHistory): boolean {
  return h.series.some(happened);
}

/** The rated weeks as chart points, each weighted by its number of reviews. */
export function ratingPoints(series: HistoryWeek[]): ScorePoint[] {
  return activeWeeks(series)
    .filter((w): w is HistoryWeek & {rating: WeekRating} => w.rating !== null)
    .map((w) => ({
      at: w.week,
      value: w.rating.average,
      weight: w.rating.count,
      when: `Week of ${weekText(w.week)}`,
      label: `${w.rating.count} review${w.rating.count === 1 ? '' : 's'} in the week of ${weekText(w.week)}`,
    }));
}

const BUCKET_WORDS: Record<AmountBucket, string> = {
  lt1: 'under 1',
  '1to10': 'of 1–10',
  '10to100': 'of 10–100',
  gte100: 'of 100 or more',
};

/** "3 under 1, 1 of 1–10": how big the closed jobs were, in payment-token units. */
export function amountsText(amounts: Record<AmountBucket, number>): string {
  const parts = (Object.keys(BUCKET_WORDS) as AmountBucket[])
    .filter((b) => (amounts[b] ?? 0) > 0)
    .map((b) => `${amounts[b]} ${BUCKET_WORDS[b]}`);
  return parts.length ? parts.join(', ') : '—';
}
