/**
 * The compliance audit-log export (Round 3, 2026-11-09):
 * `GET /v1/admin/audit-log.csv?from=&to=`, reviewers only. The API takes `to`
 * as exclusive, defaults to the last 30 days, and refuses (422) a window of
 * more than 366 days or one that ends before it starts. A reviewer thinks in
 * days they want included, so the page asks for the last day and sends the
 * midnight after it.
 */

const DAY = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` that names a real day, as a UTC midnight; else null. */
function parseDay(v: string): Date | null {
  if (!ISO_DAY.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type AuditRange = {ok: true; from: string; to: string} | {ok: false; problem: string};

/** The `from` and exclusive `to` to send for a first and last day, both included. */
export function auditRange(firstDay: string, lastDay: string): AuditRange {
  const from = parseDay(firstDay);
  const last = parseDay(lastDay);
  if (!from || !last) return {ok: false, problem: 'Choose both dates.'};
  if (last < from) return {ok: false, problem: 'The last day must be on or after the first.'};
  const to = new Date(last.getTime() + DAY);
  if (to.getTime() - from.getTime() > 366 * DAY)
    return {ok: false, problem: 'One export covers 366 days at most; export a longer period in parts.'};
  return {ok: true, from: iso(from), to: iso(to)};
}

/** The form's starting dates: the last 30 days, today included. */
export function defaultAuditDates(now: Date): {from: string; to: string} {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {from: iso(new Date(today.getTime() - 29 * DAY)), to: iso(today)};
}

/**
 * The file name the API gives in Content-Disposition. The page names the
 * file itself: a cross-origin page cannot read that header unless the API
 * exposes it, and it does not.
 */
export function auditFilename(from: string, to: string): string {
  return `pactora-audit-${from}-${to}.csv`;
}
