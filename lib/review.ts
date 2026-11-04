import type {JobEvents} from './api';
import {safeHref} from './links';

/** Events that pay the worker; the escrow writes the review inside the same transaction. */
const PAID = new Set(['settled', 'direct_paid']);

/**
 * Was this job's review written on chain, and which transaction proves it?
 *
 * `null` while there is nothing to claim: not paid yet, or refunded. Payment
 * never waits on reputation — if the registry refused the review, the escrow
 * emitted FeedbackFailed and the score did not move, and that is said, not
 * hidden.
 */
export function reviewOf(
  job: JobEvents,
): {written: true; explorerUrl: string | null} | {written: false} | null {
  const paid = job.events.find((e) => PAID.has(e.kind));
  if (!paid) return null;
  if (job.events.some((e) => e.kind === 'feedback_failed')) return {written: false};
  return {written: true, explorerUrl: safeHref(paid.explorerUrl)};
}
