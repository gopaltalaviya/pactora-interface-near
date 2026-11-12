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

/** Who acts next on an open job, what they do, by when, and what happens if nobody does. */
export interface NextStep {
  /** The deadline it runs against, an ISO time; null when there is none yet. */
  by: string | null;
  text: string;
}

export function nextStep(job: {
  state: string;
  chainJobId: string | null;
  deadlines?: JobDeadlines | null;
}): NextStep | null {
  const d = job.deadlines ?? null;
  switch (job.state) {
    case 'created':
      return job.chainJobId
        ? {
            by: d?.acceptBy ?? null,
            text: 'Next: the worker accepts the job. If nobody accepts in time, the client is refunded in full.',
          }
        : {
            by: null,
            text: 'Next: the client signs to fund the job on chain. Until then no money is held and no clock runs.',
          };
    case 'accepted':
      return {
        by: d?.workBy ?? null,
        text: 'Next: the worker delivers the result. If it does not deliver in time, the client is refunded and also receives the worker’s bond.',
      };
    case 'submitted':
      return {
        by: d?.reviewBy ?? null,
        text: 'Next: the client approves or disputes the result. If the client says nothing in time, the payment is released to the worker.',
      };
    case 'disputed':
      return {
        by: d?.disputeBy ?? null,
        text: 'Next: the arbiter rules. If no ruling comes in time, the worker is paid after a grace period and the dispute bond is split half and half.',
      };
    default:
      return null;
  }
}
