'use client';

import {formatUnits, type RunEvent} from '@/lib/api';
import {safeHref, shortId} from '@/lib/links';

/**
 * The trace, one line per event.
 *
 * The rule this follows: **every on-chain action carries its explorer link on
 * the line where it happens.** A payment nobody can verify is
 * indistinguishable from a `console.log`, and the whole claim of the project
 * is that these payments are real.
 *
 * The second rule: a refusal reads as a decision, not as a bug. "No agent
 * offers this" and "the judge rejected the work" are the system working, and
 * they are styled to say so — amber, not red. Red is reserved for something
 * actually broken.
 */

const TONE: Record<string, string> = {
  planned: 'text-accent',
  // No plan is not a decision the system made — the model could not be
  // reached or answered off-schema — so it is red, not amber.
  'plan-failed': 'text-broken',
  discovered: 'text-muted',
  selected: 'text-text',
  hired: 'text-text',
  judged: 'text-text',
  settled: 'text-settled',
  disputed: 'text-refused',
  retrying: 'text-refused',
  skipped: 'text-refused',
  finished: 'text-settled',
  failed: 'text-broken',
};

/** The payment token, so a total reads as "0.05 USDC" rather than "50000 base units". */
export interface TraceToken {
  symbol: string;
  decimals: number;
}

export function RunTrace({
  events,
  startedAt,
  token,
  live = false,
}: {
  events: RunEvent[];
  startedAt: number | null;
  token?: TraceToken | null;
  /** A trace still streaming is announced to screen readers as lines arrive. */
  live?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-10 text-center text-sm text-muted"
      >
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-accent border-r-transparent"
        />
        Waiting for the first event…
      </p>
    );
  }

  return (
    <ol
      className="relative"
      aria-label="Run trace"
      {...(live ? {'aria-live': 'polite' as const, 'aria-relevant': 'additions' as const} : {})}
    >
      {/* The rail: one line the events hang from, so the trace reads as a
          sequence rather than a table. */}
      <span aria-hidden className="absolute bottom-3 left-[3.53rem] top-3 w-px bg-edge sm:left-[4.28rem]" />
      {/* The trace is append-only and never reordered, so position IS a
          stable identity here; `at` alone is not unique within a millisecond. */}
      {events.map((event, i) => (
        <li
          key={`${i}-${event.kind}-${event.at}`}
          className="trace-line relative flex gap-3 py-2 text-sm sm:gap-4"
        >
          <span className="tabular w-10 shrink-0 pt-0.5 text-right text-[11px] text-muted sm:w-12">
            {startedAt ? `${((event.at - startedAt) / 1000).toFixed(1)}s` : ''}
          </span>
          <span
            aria-hidden
            className={`relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-surface ${DOT[event.kind] ?? 'bg-muted'} ${
              live && i === events.length - 1 ? 'animate-pulse-ring' : ''
            }`}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:gap-3">
            <span
              className={`w-20 shrink-0 text-xs font-medium sm:pt-0.5 ${TONE[event.kind] ?? 'text-muted'}`}
            >
              {LABEL[event.kind] ?? event.kind}
            </span>
            <span className="min-w-0 flex-1 break-words leading-relaxed">
              <Line event={event} token={token ?? null} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Event kinds are words already, bar one. */
const LABEL: Record<string, string> = {'plan-failed': 'no plan'};

/** The dot on the rail carries the same meaning as the label beside it. */
const DOT: Record<string, string> = {
  planned: 'bg-accent text-accent',
  'plan-failed': 'bg-broken text-broken',
  discovered: 'bg-edge-strong text-muted',
  excluded: 'bg-refused text-refused',
  selected: 'bg-text text-text',
  hired: 'bg-chain text-chain',
  judged: 'bg-text text-text',
  settled: 'bg-settled text-settled',
  disputed: 'bg-refused text-refused',
  retrying: 'bg-refused text-refused',
  skipped: 'bg-refused text-refused',
  finished: 'bg-settled text-settled',
  failed: 'bg-broken text-broken',
};

function Line({event, token}: {event: RunEvent; token: TraceToken | null}) {
  const p = event.payload;

  switch (event.kind) {
    case 'planned':
      return (
        <>
          <strong>{String(p['subtasks'])} subtask(s)</strong>
          <span className="text-muted"> — {String(p['reasoning'] ?? '')}</span>
        </>
      );

    case 'plan-failed':
      return (
        <span className="text-broken">
          no plan — {String(p['reason'] ?? 'the model could not be reached')}
        </span>
      );

    case 'discovered':
      return (
        <span className="text-muted">
          {String(p['capability'])}: {String(p['candidates'])} candidate(s)
        </span>
      );

    case 'excluded':
      return (
        <>
          agent <strong>#{String(p['agentId'])}</strong> left out:{' '}
          <strong className="text-refused">{String(p['verdict'] ?? '')}</strong>
          {/* Why, in the trust check's own words — the numbers behind it. */}
          <span className="text-muted"> — {String(p['reason'] ?? '')}</span>
        </>
      );

    case 'selected':
      return (
        <>
          agent <strong>#{String(p['agentId'])}</strong> at {String(p['price'])}
          {/* Why this agent, not just which: a marketplace that cannot answer
              that looks like a lottery. */}
          <span className="text-muted"> — {String(p['reason'] ?? '')}</span>
        </>
      );

    case 'hired':
      return (
        <>
          job <JobId id={p['jobId']} /> for <span className="tabular">{String(p['amount'])}</span>
          <Explorer url={p['explorerUrl']} />
        </>
      );

    case 'judged':
      return (
        <>
          job <JobId id={p['jobId']} />:{' '}
          <strong className={p['accept'] ? 'text-settled' : 'text-refused'}>
            {p['accept'] ? 'accept' : 'reject'}
          </strong>{' '}
          <span className="text-muted">quality {String(p['quality'])}</span>
          {p['injectionAttempted'] === true && (
            <span className="ml-2 rounded border border-refused/50 bg-refused/10 px-1.5 py-0.5 text-xs font-medium text-refused">
              injection attempt caught
            </span>
          )}
        </>
      );

    case 'settled':
      return (
        <>
          job <JobId id={p['jobId']} /> paid
          <Explorer url={p['explorerUrl']} />
        </>
      );

    case 'disputed':
      return (
        <>
          job <JobId id={p['jobId']} /> <span className="text-muted">— {String(p['reason'] ?? '')}</span>
        </>
      );

    case 'retrying':
      return (
        <>
          job <JobId id={p['jobId']} />{' '}
          <span className="text-muted">— {String(p['reason'] ?? '')}; asking another agent</span>
        </>
      );

    case 'skipped':
      return (
        <>
          {String(p['capability'])}: <strong>{String(p['status'])}</strong>
          <span className="text-muted"> — {String(p['detail'] ?? '')}</span>
        </>
      );

    case 'finished':
      return (
        <span className="text-muted">
          spent <Amount base={p['spent']} token={token} />
        </span>
      );

    case 'failed':
      return <span className="text-broken">{String(p['detail'] ?? 'the run failed')}</span>;

    default:
      return <span className="text-muted">{JSON.stringify(p)}</span>;
  }
}

function JobId({id}: {id: unknown}) {
  const text = String(id ?? '');
  return (
    <strong className="tabular" title={text}>
      {shortId(text)}
    </strong>
  );
}

function Amount({base, token}: {base: unknown; token: TraceToken | null}) {
  const text = String(base ?? '');
  if (!/^\d+$/.test(text)) return <span className="tabular">{text || '—'}</span>;
  return (
    <span className="tabular">
      {token ? `${formatUnits(text, token.decimals)} ${token.symbol}` : `${text} base units`}
    </span>
  );
}

function Explorer({url}: {url: unknown}) {
  const href = safeHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ml-2 inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/5 px-1.5 py-px text-[11px] text-accent transition-colors hover:border-accent/60 hover:bg-accent/10"
    >
      explorer ↗<span className="sr-only"> (opens the block explorer in a new tab)</span>
    </a>
  );
}
