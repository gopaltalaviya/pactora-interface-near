'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Badge, StatusDot, type Tone} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Icon, type IconName} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {ApiError, api, type ComponentStatus, type GasStatus, type StatusReport} from '@/lib/api';
import {relativeTime} from '@/lib/format';
import {stalledIndexers, type StalledIndexer} from '@/lib/status';
import {displayAccount, formatYocto} from '@/lib/near';

/**
 * Is Pactora working right now?
 *
 * A public page over `GET /v1/status`, which reports states and numbers only
 * — never a host, URL or error message — so nothing here can leak where the
 * infrastructure lives. It refreshes on its own while the tab is visible, and
 * stops when it is not: a status page left open in a background tab should
 * not be the API's busiest client.
 *
 * "Can't reach the API" is itself a status, and the most important one, so it
 * is shown as one rather than as an error page.
 */

const REFRESH_MS = 15_000;

/**
 * The AI model, apart from the components: a free-tier key out of its daily
 * quota stops new runs from thinking, but it is not the protocol being down.
 */
function ModelCard({model}: {model: NonNullable<StatusReport['model']>}) {
  const word = {ok: 'available', limited: 'daily quota used up', unknown: 'not yet known'}[model.state];
  const tone: Tone = model.state === 'ok' ? 'settled' : model.state === 'limited' ? 'refused' : 'neutral';
  return (
    <section
      aria-label="AI model"
      className="flex gap-3 rounded-xl border border-edge bg-surface/80 p-4 backdrop-blur-sm"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge bg-raised text-muted">
        <Icon name="sparkle" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">AI model (hosted runs)</span>
          <Badge tone={tone} dot>
            {word}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          What the hosted agents think with — a free-tier key with a small daily quota. Judged from real runs,
          never by spending the quota. Escrow, settlement and reputation do not depend on it.
        </p>
        {model.state === 'limited' && (
          <p className="text-xs font-medium text-text">
            {model.detail ?? 'The quota is used up for now.'}
            {model.since ? ` Since ${relativeTime(model.since)}; it resets daily.` : ''}
          </p>
        )}
        {model.lastDelivered && (
          <p className="text-xs text-muted">
            Last delivered run:{' '}
            <a href={`/runs/${model.lastDelivered.runId}`} className="text-accent underline">
              {relativeTime(model.lastDelivered.at)}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Gas, apart from the components: the signer's own reading of the
 * wallets it sends from. A low one is the next transaction failing, said
 * before it happens rather than as a revert during a run.
 */
/** A yoctoNEAR balance in NEAR, to four places: enough to see an account running dry. */
const native = (yocto: string | null) => (yocto === null ? 'not read' : `${formatYocto(yocto)} NEAR`);

function GasCard({gas}: {gas: GasStatus}) {
  const word = {ok: 'every wallet funded', low: 'a wallet is low', unknown: 'not yet read'}[gas.state];
  const tone: Tone = gas.state === 'ok' ? 'settled' : gas.state === 'low' ? 'broken' : 'neutral';
  return (
    <section
      aria-label="Gas"
      className="flex gap-3 rounded-xl border border-edge bg-surface/80 p-4 backdrop-blur-sm"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge bg-raised text-muted">
        <Icon name="coins" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Gas (the signer&apos;s accounts)</span>
          <Badge tone={tone} dot>
            {word}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          The NEAR balance of every account the signer sends transactions from, read in the background
          {gas.checkedAt ? ` — last ${relativeTime(gas.checkedAt)}` : ''}. A low one is topped up before the
          next run, not discovered by it.
        </p>
        {gas.wallets.length > 0 && (
          <ul className="space-y-1 text-xs">
            {gas.wallets.map((w) => (
              <li key={w.address} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted">
                  {w.role} <span className="tabular text-text">{displayAccount(w.address)}</span>
                </span>
                <span className={`tabular ${w.low ? 'font-medium text-broken' : 'text-text'}`}>
                  {native(w.balanceYocto)}
                  {w.low ? ' — low' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const COMPONENTS: {key: keyof StatusReport['components']; name: string; icon: IconName; what: string}[] = [
  {key: 'api', name: 'API', icon: 'bolt', what: 'Answers this site and every agent.'},
  {key: 'database', name: 'Database', icon: 'coins', what: 'Holds agents, jobs, runs and reputation.'},
  {
    key: 'signer',
    name: 'Signer',
    icon: 'key',
    what: "Signs agents' transactions, under their spending caps.",
  },
  {key: 'rpc', name: 'Chain connection', icon: 'link', what: 'Our connection to NEAR.'},
  {
    key: 'indexer',
    name: 'Indexer',
    icon: 'activity',
    what: 'Turns on-chain settlements into what this site shows.',
  },
];

const TONE: Record<ComponentStatus, Tone> = {
  up: 'settled',
  degraded: 'refused',
  down: 'broken',
  stalled: 'broken',
  unknown: 'neutral',
};
const WORD: Record<ComponentStatus, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  stalled: 'Stalled',
  unknown: 'Not reported',
};

const OVERALL: Record<StatusReport['status'], {tone: Tone; title: string; body: string}> = {
  operational: {
    tone: 'settled',
    title: 'All systems operational',
    body: 'Agents can be hired and paid, and settlements reach the marketplace as they happen.',
  },
  degraded: {
    tone: 'refused',
    title: 'Partially degraded',
    body: 'The site is up, but at least one part is slow or not reporting. Scores and runs may lag the chain.',
  },
  down: {
    tone: 'broken',
    title: 'Major outage',
    body: 'The API cannot reach its database, so it can serve nothing. Funds in escrow are safe on chain.',
  },
};

/**
 * One line on WHY a component is not up, where the report says. "Degraded"
 * alone left an operator unable to tell "wait, it is catching up" from "go and
 * restart it".
 */
function why(key: keyof StatusReport['components'], state: ComponentStatus, report: StatusReport) {
  if (state === 'up' || state === 'unknown') return null;
  if (key === 'indexer') {
    if (state === 'stalled' || stalledIndexers(report).length > 0)
      return stalledIndexers(report).some((s) => s.pruned)
        ? 'Stalled — the block it starts from is gone from the RPC, so it cannot move forward. See above.'
        : 'Stalled — it cannot move forward on its own. See above.';
    const worst = report.chains.find((c) => c.indexer.status === state)?.indexer;
    if (!worst) return null;
    if (state === 'down') {
      const mins =
        worst.secondsSinceIndexed === null ? null : Math.max(1, Math.round(worst.secondsSinceIndexed / 60));
      return `Stopped — no progress${mins === null ? '' : ` for ${mins} min`}, with blocks waiting to be indexed.`;
    }
    return worst.lagBlocks === null
      ? null
      : `Catching up — ${worst.lagBlocks.toLocaleString('en')} blocks behind, still moving.`;
  }
  if (key === 'rpc') return 'The chain is not answering us; on-chain actions will wait until it does.';
  if (key === 'signer') return 'New hires and payments cannot be signed; browsing and records still work.';
  return null;
}

export function StatusView() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [failure, setFailure] = useState<'unreachable' | 'unsupported' | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastTry, setLastTry] = useState<number | null>(null);
  const [, tick] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    try {
      setReport(await api.status(controller.signal));
      setFailure(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      // An API that predates /v1/status answers 404: it is up, just older.
      setFailure(err instanceof ApiError && err.code === 'NOT_FOUND' ? 'unsupported' : 'unreachable');
      setReport(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLastTry(Date.now());
      }
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      if (!timer) timer = setInterval(() => void load(), REFRESH_MS);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stopTimer();
      else {
        void load();
        startTimer();
      }
    };
    startTimer();
    document.addEventListener('visibilitychange', onVisibility);
    // Keeps "checked 12 seconds ago" honest between refreshes.
    const clock = setInterval(() => tick((n) => n + 1), 5_000);
    return () => {
      stopTimer();
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisibility);
      inFlight.current?.abort();
    };
  }, [load]);

  const overall = report ? OVERALL[report.status] : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Status"
        title="System status"
        description="Whether Pactora is working right now. This page refreshes itself every 15 seconds while it is open."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            loading={loading && report !== null}
          >
            {!(loading && report !== null) && <Icon name="refresh" className="size-3.5" />}
            Refresh
          </Button>
        }
      />

      {!report && !failure && (
        <Loading label="Checking status">
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
        </Loading>
      )}

      {failure === 'unreachable' && (
        <ErrorState
          title="The API cannot be reached"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>
              Try again
            </Button>
          }
        >
          This page, the marketplace and runs all depend on it. Anything already locked in escrow is safe on
          chain and has a permissionless way out — the contract does not need this API to refund or settle.
        </ErrorState>
      )}

      {failure === 'unsupported' && (
        <ErrorState title="This API does not report its status">
          It answers, but predates the status endpoint. Everything else on the site may still work.
        </ErrorState>
      )}

      {report && overall && (
        <>
          <section
            aria-live="polite"
            className={
              'animate-enter relative overflow-hidden rounded-xl border p-5 sm:p-6 ' +
              (overall.tone === 'settled'
                ? 'border-settled/30 bg-settled/[0.06]'
                : overall.tone === 'refused'
                  ? 'border-refused/30 bg-refused/[0.06]'
                  : 'border-broken/30 bg-broken/[0.06]')
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={
                  'grid size-11 place-items-center rounded-full ' +
                  (overall.tone === 'settled'
                    ? 'bg-settled/15 text-settled'
                    : overall.tone === 'refused'
                      ? 'bg-refused/15 text-refused'
                      : 'bg-broken/15 text-broken')
                }
              >
                <Icon name={report.status === 'operational' ? 'check' : 'alert'} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight">{overall.title}</h2>
                <p className="text-sm text-muted">{overall.body}</p>
              </div>
              <p className="text-xs text-muted">
                checked{' '}
                <time dateTime={report.checkedAt} title={new Date(report.checkedAt).toLocaleString()}>
                  {relativeTime(report.checkedAt)}
                </time>
              </p>
            </div>
          </section>

          {stalledIndexers(report).map((s) => (
            <StalledNotice key={s.chain} stalled={s} />
          ))}

          <section aria-label="Components">
            <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COMPONENTS.map((c, i) => {
                const state = report.components[c.key];
                return (
                  <li
                    key={c.key}
                    style={{'--i': i} as React.CSSProperties}
                    className="flex gap-3 rounded-xl border border-edge bg-surface/80 p-4 backdrop-blur-sm"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-edge bg-raised text-muted">
                      <Icon name={c.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{c.name}</span>
                        <Badge tone={TONE[state]} dot>
                          {WORD[state]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{c.what}</p>
                      {why(c.key, state, report) && (
                        <p className="mt-1 text-xs font-medium text-text">{why(c.key, state, report)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {report.model && <ModelCard model={report.model} />}
          {report.gas && <GasCard gas={report.gas} />}

          {report.chains.map((chain) => (
            <Card
              key={chain.chainId}
              title={
                <span className="flex items-center gap-2">
                  {chain.name}
                  {chain.testnet && <Badge tone="chain">testnet</Badge>}
                </span>
              }
              description="How closely this site follows the chain. The indexer stays a few blocks behind the head on purpose, so a reorganised block is never shown."
            >
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ChainFigure
                  label="Chain head"
                  value={chain.headBlock?.toLocaleString('en') ?? '—'}
                  state={chain.rpc}
                />
                <ChainFigure
                  label="Indexed to"
                  value={chain.indexer.indexedBlock?.toLocaleString('en') ?? '—'}
                  state={chain.indexer.status}
                />
                <ChainFigure
                  label="Behind by"
                  value={
                    chain.indexer.lagBlocks === null
                      ? '—'
                      : `${chain.indexer.lagBlocks.toLocaleString('en')} blocks`
                  }
                />
                <ChainFigure
                  label="Last indexed"
                  value={chain.indexer.lastIndexedAt ? relativeTime(chain.indexer.lastIndexedAt) : 'never'}
                />
              </dl>
            </Card>
          ))}

          {report.build && (
            <p className="tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>
                {report.build.service} v{report.build.version}
              </span>
              <span>commit {report.build.commit}</span>
              {report.build.builtAt && <span>built {new Date(report.build.builtAt).toLocaleString()}</span>}
            </p>
          )}
        </>
      )}

      {lastTry && (
        <p className="sr-only" role="status">
          Status last checked {new Date(lastTry).toLocaleTimeString()}.
        </p>
      )}
    </div>
  );
}

/**
 * A stalled indexer, said plainly: it will not catch up by waiting. New
 * settlements stay safe on chain but stop reaching this site, and the fix is
 * the operator's (the API names it).
 */
function StalledNotice({stalled}: {stalled: StalledIndexer}) {
  return (
    <section
      role="alert"
      aria-label={`Indexer stalled on ${stalled.chain}`}
      className="space-y-1.5 rounded-xl border border-broken/40 bg-broken/[0.06] p-4 text-sm"
    >
      <p className="font-semibold">
        The indexer has stopped on {stalled.chain}
        {stalled.pruned ? ': the block it starts from has been pruned.' : '.'}
      </p>
      <p className="text-muted">
        {stalled.pruned
          ? 'The RPC it reads keeps only recent blocks, and the one the indexer needs next is gone, so it cannot move forward — waiting will not fix it. '
          : 'It is not catching up, and waiting will not fix it. '}
        Jobs and payments still settle on chain, safely, but new settlements, scores and reviews do not reach
        this site until it is restarted.
      </p>
      <p className="text-xs text-muted">
        Reported state: <code className="tabular">{stalled.state}</code>
        {stalled.fix && (
          <>
            {' '}
            · Operator fix: <code className="tabular">{stalled.fix}</code>
          </>
        )}
      </p>
    </section>
  );
}

function ChainFigure({label, value, state}: {label: string; value: string; state?: ComponentStatus}) {
  return (
    <div className="rounded-lg border border-edge bg-ink/50 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        {state && <StatusDot tone={TONE[state]} />}
        {label}
      </dt>
      <dd className="tabular mt-1 font-semibold">{value}</dd>
    </div>
  );
}
