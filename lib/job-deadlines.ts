/**
 * A job's deadlines, as the job page shows them (2026-11-10).
 *
 * GET /v1/jobs/:id carries the contract's deadlines as ISO times
 * (`deadlines`), null until the job is on chain or until that phase has
 * started. Before then, the page can only say how long each phase will last
 * once the job is funded, from GET /v1/network's `windows`.
 *
 * No open job waits forever: the contract has an exit for every open state
 * that anyone may call once its deadline passes, and Pactora's keeper calls
 * it (pactora-backend-near apps/signer/src/keeper.ts).
 */

export interface JobDeadlines {
  acceptBy: string | null;
  workBy: string | null;
  reviewBy: string | null;
  disputeBy: string | null;
}

export interface DeadlineRow {
  key: keyof JobDeadlines;
  label: string;
  at: string;
  passed: boolean;
  /** The deadline the job's current state runs against. */
  current: boolean;
}

const ROWS: {key: keyof JobDeadlines; label: string; state: string}[] = [
  {key: 'acceptBy', label: 'Accept by', state: 'created'},
  {key: 'workBy', label: 'Deliver by', state: 'accepted'},
  {key: 'reviewBy', label: 'Review by', state: 'submitted'},
  {key: 'disputeBy', label: 'Ruling due by', state: 'disputed'},
];

const OPEN = new Set(['created', 'accepted', 'submitted', 'disputed']);

export function deadlineRows(
  job: {state: string; chainJobId: string | null; deadlines?: JobDeadlines | null},
  nowMs: number,
): DeadlineRow[] {
  if (!job.chainJobId || !job.deadlines || !OPEN.has(job.state)) return [];
  const d = job.deadlines;
  return ROWS.flatMap(({key, label, state}) => {
    const at = d[key];
    if (!at) return [];
    const t = Date.parse(at);
    if (Number.isNaN(t)) return [];
    return [{key, label, at, passed: t < nowMs, current: job.state === state}];
  });
}

/** Seconds, in the largest whole unit. */
export function duration(seconds: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (seconds % 86400 === 0) return unit(seconds / 86400, 'day');
  if (seconds % 3600 === 0) return unit(seconds / 3600, 'hour');
  if (seconds % 60 === 0) return unit(seconds / 60, 'minute');
  return unit(seconds, 'second');
}

/** Before the job is on chain: how long each phase lasts once it is funded. */
export function windowsText(
  windows: {accept: number; work: number; review: number; dispute?: number} | undefined,
): string | null {
  if (!windows) return null;
  return `Once it is funded: ${duration(windows.accept)} to accept, then ${duration(windows.work)} to deliver, then ${duration(windows.review)} for the client to review.`;
}

export const KEEPER_LINE =
  'If a deadline passes, Pactora’s keeper closes the job on chain by itself: a job nobody accepted or delivered is refunded to the client, a delivery left unreviewed is paid to the worker, and a dispute the arbiter never rules on is paid to the worker after a grace period.';
