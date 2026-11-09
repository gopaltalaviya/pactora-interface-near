import {utc} from '@/components/market/ListingCard';

/**
 * A small score-over-time chart, drawn as inline SVG (no library): one point
 * per settled job or review, in time order, the line being the running
 * average. The numbers are also a table, open on request, for a screen
 * reader and for anyone who wants the figures (2026-11-09, item 11).
 */
export interface ScorePoint {
  at: string;
  /** The value at this point, on the scale given. */
  value: number;
  /** What this point is: "5 from Olive", "settled 4 USDC". */
  label: string;
  /** How many values this point stands for (a week of 3 reviews is 3); 1 if absent. */
  weight?: number;
  /** The table's "When" for this point, when the time of day means nothing (a week). */
  when?: string;
}

/** The running average after each point, weighted by each point's weight, to one decimal. */
export function runningAverage(points: ScorePoint[]): number[] {
  const out: number[] = [];
  let sum = 0;
  let n = 0;
  for (const p of points) {
    const w = p.weight ?? 1;
    sum += p.value * w;
    n += w;
    out.push(n === 0 ? 0 : Math.round((sum / n) * 10) / 10);
  }
  return out;
}

export function ScoreChart({
  points,
  max,
  title,
  unit,
}: {
  points: ScorePoint[];
  /** The top of the scale (5 for a rating, 100 for a score). */
  max: number;
  title: string;
  unit: string;
}) {
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  if (sorted.length === 0) return null;
  const avg = runningAverage(sorted);
  const W = 320;
  const H = 96;
  const PAD = 8;
  const x = (i: number) => (sorted.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (sorted.length - 1));
  const y = (v: number) => H - PAD - (Math.max(0, Math.min(max, v)) / max) * (H - 2 * PAD);
  const line = avg.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = avg.at(-1)!;
  const summary = `${title}: ${sorted.length} point${sorted.length === 1 ? '' : 's'}, running average now ${last} ${unit}, from ${utc(sorted[0]!.at)} to ${utc(sorted.at(-1)!.at)}.`;
  return (
    <figure className="space-y-2" data-testid="score-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full max-w-md" role="img" aria-label={summary}>
        <line
          x1={PAD}
          y1={y(max)}
          x2={W - PAD}
          y2={y(max)}
          stroke="var(--color-edge)"
          strokeDasharray="2 3"
        />
        <line
          x1={PAD}
          y1={y(max / 2)}
          x2={W - PAD}
          y2={y(max / 2)}
          stroke="var(--color-edge)"
          strokeDasharray="2 3"
        />
        <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} stroke="var(--color-edge)" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        {sorted.map((p, i) => (
          <circle
            key={`${p.at}-${i}`}
            cx={x(i)}
            cy={y(p.value)}
            r="3"
            fill="var(--color-settled)"
            stroke="var(--color-ink)"
            strokeWidth="1"
          />
        ))}
      </svg>
      <figcaption className="text-xs text-muted">
        {summary} Dots are the single values; the line is the running average.
      </figcaption>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">The figures as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left" aria-label={`${title}, as a table`}>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  When
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  What
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Value
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Average so far
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {sorted.map((p, i) => (
                <tr key={`${p.at}-${i}`}>
                  <td className="py-1 pr-3">{p.when ?? utc(p.at)}</td>
                  <td className="py-1 pr-3">{p.label}</td>
                  <td className="tabular py-1 pr-3 text-right">{p.value}</td>
                  <td className="tabular py-1 text-right">{avg[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
