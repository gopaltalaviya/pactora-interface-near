'use client';

import {useEffect, useState} from 'react';
import {Card} from '@/components/ui/Card';
import {Skeleton} from '@/components/ui/States';
import {ScoreChart} from '@/components/market/ScoreChart';
import {
  activeWeeks,
  amountsText,
  hasHistory,
  history,
  ratingPoints,
  weekText,
  type HistoryWeek,
  type ParticipantHistory,
} from '@/lib/history';

/**
 * The record over time, from the API's weekly history (Round 3): jobs closed
 * each week as bars, and the rating as the same score chart the profiles
 * use. Both are SVG with the figures as a table, as ScoreChart is. The
 * history has no 0–100 score per week (only counts and ratings), so neither
 * chart pretends to plot one.
 */
export function RecordOverTime({
  subject,
}: {
  /** An agent by its numeric id, or a published profile by its id. */
  subject: {agentId: number} | {profileId: string};
}) {
  const agentId = 'agentId' in subject ? subject.agentId : null;
  const profileId = 'profileId' in subject ? subject.profileId : null;
  const [h, setH] = useState<ParticipantHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setH(null);
    setFailed(false);
    (agentId !== null
      ? history.agent(agentId, controller.signal)
      : history.profile(profileId ?? '', controller.signal)
    )
      .then(setH)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [agentId, profileId]);

  return (
    <Card
      title="Record over time"
      labelledBy="record-over-time"
      description="The last 52 weeks, by the week a job closed or a review was written, as client or as worker."
    >
      {failed ? (
        <p className="text-sm text-muted">
          The record over time could not be loaded. The figures above do not depend on it.
        </p>
      ) : !h ? (
        <div role="status" aria-label="Loading the record over time">
          <Skeleton className="h-24 w-full max-w-md" />
        </div>
      ) : !hasHistory(h) ? (
        <p className="text-sm text-muted">No jobs closed and no reviews shown in the last 52 weeks.</p>
      ) : (
        <div className="space-y-6">
          {(h.totals.settled > 0 || h.totals.refunded > 0) && <ActivityChart history={h} />}
          {ratingPoints(h.series).length > 0 && (
            <ScoreChart title="Rating over time" unit="out of 5" max={5} points={ratingPoints(h.series)} />
          )}
        </div>
      )}
    </Card>
  );
}

/** Jobs closed per week: settled and refunded, stacked, one bar a week. */
export function ActivityChart({history: h}: {history: ParticipantHistory}) {
  const weeks = [...h.series].sort((a, b) => a.week.localeCompare(b.week));
  const W = 320;
  const H = 96;
  const PAD = 8;
  const top = Math.max(1, ...weeks.map((w) => w.settled + w.refunded));
  const slot = (W - 2 * PAD) / Math.max(1, weeks.length);
  const bar = Math.max(1, slot - 1.5);
  const y = (v: number) => (v / top) * (H - 2 * PAD);
  const first = weeks[0];
  const last = weeks.at(-1);
  const title = 'Jobs closed per week';
  const summary =
    `${title}: ${h.totals.settled} settled and ${h.totals.refunded} refunded in the last ${weeks.length} weeks` +
    (first && last
      ? `, from the week of ${weekText(first.week)} to the week of ${weekText(last.week)}`
      : '') +
    `; the busiest week had ${top}.`;
  const active = activeWeeks(weeks);
  return (
    <figure className="space-y-2" data-testid="activity-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full max-w-md" role="img" aria-label={summary}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--color-edge)" />
        <line x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} stroke="var(--color-edge)" strokeDasharray="2 3" />
        {weeks.map((w, i) => {
          const x = PAD + i * slot;
          const s = y(w.settled);
          const r = y(w.refunded);
          return (
            <g key={w.week}>
              {w.settled > 0 && (
                <rect x={x} y={H - PAD - s} width={bar} height={s} fill="var(--color-settled)" />
              )}
              {w.refunded > 0 && (
                <rect x={x} y={H - PAD - s - r} width={bar} height={r} fill="var(--color-refused)" />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted">
        {summary} <Swatch tone="settled" /> settled, <Swatch tone="refused" /> refunded.
      </figcaption>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">The figures as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left" aria-label={`${title}, as a table`}>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Week of
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Settled
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Refunded
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  As worker
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  As client
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Sizes (token units)
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {active.map((w) => (
                <Row key={w.week} w={w} />
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-muted">Weeks with nothing closed and no review are left out.</p>
        </div>
      </details>
    </figure>
  );
}

function Row({w}: {w: HistoryWeek}) {
  return (
    <tr>
      <td className="py-1 pr-3">{weekText(w.week)}</td>
      <td className="tabular py-1 pr-3 text-right">{w.settled}</td>
      <td className="tabular py-1 pr-3 text-right">{w.refunded}</td>
      <td className="tabular py-1 pr-3 text-right">{w.asWorker}</td>
      <td className="tabular py-1 pr-3 text-right">{w.asClient}</td>
      <td className="py-1 pr-3">{amountsText(w.amounts)}</td>
      <td className="tabular py-1 text-right">
        {w.rating ? `${w.rating.average} (${w.rating.count})` : '—'}
      </td>
    </tr>
  );
}

function Swatch({tone}: {tone: 'settled' | 'refused'}) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 rounded-sm align-middle ${tone === 'settled' ? 'bg-settled' : 'bg-refused'}`}
    />
  );
}
