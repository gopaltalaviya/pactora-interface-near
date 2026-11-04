'use client';

import Link from 'next/link';
import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {RunTrace, type TraceToken} from '@/components/RunTrace';
import {ModelFailureNotice, ModelLimitedNotice, isModelFailure} from '@/components/ModelNotice';
import {StepList} from '@/components/StepList';
import {Badge} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {CopyButton} from '@/components/ui/CopyButton';
import {Field, SecretInput, TextArea} from '@/components/ui/Field';
import {Icon, type IconName} from '@/components/ui/Icon';
import {CountUp, Reveal} from '@/components/ui/Motion';
import {ErrorState} from '@/components/ui/States';
import {
  ApiError,
  api,
  formatUnits,
  subscribeToRun,
  type AgentSummary,
  type ModelStatus,
  type NetworkInfo,
  type RunDetail,
  type RunEvent,
  type StreamState,
} from '@/lib/api';
import {shortId} from '@/lib/links';

/**
 * The live demo.
 *
 * One box, one sentence, and then everything that happens is a consequence of
 * agents deciding: what to commission, who to hire, whether the work was
 * worth paying for. This page IS the submission video, which drives three
 * choices:
 *
 * - **Explorer link on every on-chain line.** A payment nobody can check is
 *   indistinguishable from a log message.
 * - **Refusals are shown, not hidden.** A worker declining, a judge rejecting
 *   work, a budget running out — these are the system working, and an
 *   audience that only ever sees the happy path has no reason to believe the
 *   rest exists.
 * - **The totals are always on screen**, because "what did that cost" is the
 *   first question anyone asks.
 */

const EXAMPLES = [
  'Research ETH/USDC liquidity on Monad and tell me whether to open a position.',
  'Find the cheapest agent that can summarise a protocol, and have it summarise Monad.',
  'Analyse the risk of providing liquidity to a new pool, then plan the entry.',
];

const GUIDE: {icon: IconName; title: string; body: string; link?: {href: string; label: string}}[] = [
  {
    icon: 'key',
    title: 'Get an orchestrator key',
    body: 'Register an agent to act as your orchestrator. Its API key is shown once — copy it. Its wallet must be funded to pay the agents it hires.',
    link: {href: '/register', label: 'Register an agent'},
  },
  {
    icon: 'sparkle',
    title: 'Give it a goal',
    body: 'Paste the key above, pick an example or write your own sentence, and press Run (or Ctrl+Enter).',
  },
  {
    icon: 'activity',
    title: 'Watch it settle',
    body: 'The trace shows the plan, each hire and verdict, and every settlement with its transaction. The run is kept at a link you can share.',
    link: {href: '/runs', label: 'See past runs'},
  },
];

/** Where a run is, derived from what has actually happened — never a timer. */
const PHASES = ['Planning', 'Hiring', 'Judging', 'Settling', 'Done'] as const;
/** The last phase's name when the run ended without delivering. */
const FAILED_PHASE = 'Failed';
function phaseOf(events: RunEvent[], finished: boolean): number {
  if (finished) return 4;
  const kinds = new Set(events.map((e) => e.kind));
  if (kinds.has('settled')) return 3;
  if (kinds.has('judged')) return 2;
  if (kinds.has('hired') || kinds.has('selected')) return 1;
  return 0;
}

export default function DemoPage() {
  const [goal, setGoal] = useState(EXAMPLES[0]!);
  const [apiKey, setApiKey] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stream, setStream] = useState<StreamState>('open');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const token: TraceToken | null = network?.paymentToken ?? null;
  const ids = {goal: useId(), key: useId(), keyNote: useId()};
  const results = useRef<HTMLElement>(null);

  const unsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => () => unsubscribe.current?.(), []);

  // For money as money, and the live figures. The badge already reports an
  // unreachable API, so a failure here only means those stay hidden.
  useEffect(() => {
    const controller = new AbortController();
    api
      .network(controller.signal)
      .then(setNetwork)
      .catch(() => undefined);
    api
      .agents({rank: 'balanced', limit: 50}, controller.signal)
      .then(setAgents)
      .catch(() => undefined);
    // Whether the AI model is out of its free quota right now, so a judge is
    // told before pressing Run rather than after a failed run.
    api
      .status(controller.signal)
      .then((s) => setModel(s.model ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const running = runId !== null && !finished;

  const start = useCallback(async () => {
    setError(null);
    setEvents([]);
    setDetail(null);
    setFinished(false);
    setStream('open');
    setStarting(true);
    unsubscribe.current?.();

    try {
      const {runId: id} = await api.startRun(goal, apiKey.trim());
      setRunId(id);
      setStartedAt(Date.now());
      requestAnimationFrame(() => results.current?.scrollIntoView({behavior: 'smooth', block: 'start'}));

      unsubscribe.current = subscribeToRun(
        id,
        (event) => setEvents((prev) => [...prev, event]),
        () => {
          setFinished(true);
          // The figures at the top are the marketplace's, written by the
          // indexer from settlements a few blocks behind the head — so read
          // them again shortly after, and watch them count up to this run.
          for (const delay of [4_000, 12_000]) {
            setTimeout(() => {
              api
                .agents({rank: 'balanced', limit: 50})
                .then(setAgents)
                .catch(() => undefined);
            }, delay);
          }
          // Read the finished run once the stream closes: the row carries the
          // synthesised answer and the per-step outcomes, which the event
          // trace deliberately does not repeat.
          // A server may still be writing the row when the stream closes (an
          // older API wrote the answer after `finished`): read again, briefly,
          // until it no longer says "running".
          void (async () => {
            for (let attempt = 0; attempt < 6; attempt++) {
              try {
                const run = await api.run(id);
                setDetail(run);
                if (run.state !== 'running') return;
              } catch (err) {
                // Only "still running" is worth waiting out; an error will not fix itself here.
                console.warn('could not read the finished run', err);
                return;
              }
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            }
          })();
        },
        setStream,
        // A reconnect replays the whole history: start the trace over.
        () => setEvents([]),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'could not start the run',
      );
    } finally {
      setStarting(false);
    }
  }, [goal, apiKey]);

  const canRun = !running && !starting && goal.trim().length >= 3 && apiKey.trim().length > 0;

  const spentBase = events.find((e) => e.kind === 'finished')?.payload['spent'];
  const spend =
    detail?.spentDisplay ??
    (typeof spentBase === 'string' && /^\d+$/.test(spentBase)
      ? token
        ? `${formatUnits(spentBase, token.decimals)} ${token.symbol}`
        : `${spentBase} base units`
      : null);
  const hires = events.filter((e) => e.kind === 'hired').length;
  const settlements = events.filter((e) => e.kind === 'settled').length;
  const phase = phaseOf(events, finished);
  // Ended without delivering: the record says `failed`, or the stream's own
  // terminal event did. Either way it is not a green "finished".
  const failedEvent = events.find((e) => e.kind === 'failed');
  const failed = detail?.state === 'failed' || failedEvent !== undefined;
  const failure =
    detail?.error ??
    (typeof failedEvent?.payload['detail'] === 'string' ? failedEvent.payload['detail'] : null);

  const proven = agents?.filter((a) => a.completed + a.failed > 0).length ?? 0;
  const settledJobs = agents?.reduce((sum, a) => sum + a.completed, 0) ?? 0;

  return (
    <div className="space-y-16">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="animate-enter space-y-6 pt-4 text-center sm:pt-10">
        <div className="flex justify-center">
          <Badge tone="chain" dot>
            ERC-8004 agents · paid on Monad
          </Badge>
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          One sentence.{' '}
          <span className="bg-gradient-to-r from-accent via-[#b3a7ff] to-chain bg-clip-text text-transparent">
            Agents do the rest
          </span>{' '}
          — and pay each other for it.
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted">
          Everything below happens on Monad. Each agent&apos;s reputation is written only when a payment
          actually settles, so it cannot be self-reported.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => document.getElementById(ids.goal)?.focus()}>
            Start a run <Icon name="arrowRight" className="size-4" />
          </Button>
          <ButtonLink href="/agents">Browse the marketplace</ButtonLink>
        </div>

        {/* Real figures from the API, or nothing — never a placeholder number. */}
        {agents && agents.length > 0 && (
          <dl className="mx-auto grid max-w-2xl grid-cols-3 gap-3 pt-4">
            <HeroFigure label="agents listed" value={agents.length} />
            <HeroFigure label="with settled history" value={proven} />
            <HeroFigure label="jobs settled" value={settledJobs} />
          </dl>
        )}
      </section>

      {/* ── Console ──────────────────────────────────────────────────────── */}
      {model?.state === 'limited' && !runId && <ModelLimitedNotice model={model} />}
      <Reveal>
        <Card className="relative overflow-hidden p-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
          />
          <form
            className="space-y-5 p-5 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (canRun) void start();
            }}
          >
            <Field
              label="Goal"
              htmlFor={ids.goal}
              hint={
                <span className="flex justify-between gap-3">
                  <span>Say what you want done, in one sentence. Ctrl+Enter runs it.</span>
                  <span className="tabular">{goal.length}</span>
                </span>
              }
            >
              <TextArea
                id={ids.goal}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canRun) {
                    e.preventDefault();
                    void start();
                  }
                }}
                rows={2}
                disabled={running}
                placeholder="What do you want done?"
              />
            </Field>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">Or start from an example</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    title={example}
                    aria-label={`Use example: ${example}`}
                    aria-pressed={goal === example}
                    onClick={() => setGoal(example)}
                    disabled={running}
                    className={
                      'max-w-full truncate rounded-full border px-3 py-1.5 text-xs transition-all duration-200 active:scale-[0.97] disabled:opacity-40 sm:max-w-[20rem] ' +
                      (goal === example
                        ? 'border-accent/60 bg-accent/10 text-text'
                        : 'border-edge text-muted hover:border-edge-strong hover:text-text')
                    }
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <Field
                label="Orchestrator API key"
                htmlFor={ids.key}
                hintId={ids.keyNote}
                hint={
                  // Said plainly rather than in a tooltip: a page that quietly
                  // keeps a credential is a page nobody should paste one into.
                  <>
                    The key is used for this request only — it is never stored, and the run spends under that
                    agent&apos;s own spending caps, which the signer enforces. No key yet?{' '}
                    <Link href="/register" className="text-accent hover:underline">
                      Register an agent
                    </Link>
                    .
                  </>
                }
              >
                <SecretInput
                  id={ids.key}
                  value={apiKey}
                  onChange={setApiKey}
                  disabled={running}
                  aria-describedby={ids.keyNote}
                  placeholder="Orchestrator API key (ax_…)"
                />
              </Field>
              <Button
                type="submit"
                disabled={!canRun}
                loading={starting || running}
                className="sm:mt-[1.625rem] sm:min-w-28"
              >
                {running ? 'Running…' : starting ? 'Starting…' : 'Run'}
              </Button>
            </div>

            {error && (
              <ErrorState
                title="The run did not start"
                action={
                  <Button variant="secondary" size="sm" onClick={() => void start()} disabled={!canRun}>
                    <Icon name="refresh" className="size-3.5" /> Try again
                  </Button>
                }
              >
                {error}
              </ErrorState>
            )}
          </form>
        </Card>
      </Reveal>

      {/* ── A run in progress, or its result ─────────────────────────────── */}
      {runId && (
        <section ref={results} aria-label="This run" className="scroll-mt-24 space-y-4">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">run</span>
                <Link
                  href={`/runs/${runId}`}
                  title={runId}
                  className="tabular font-medium text-accent hover:underline"
                >
                  {shortId(runId)}
                </Link>
                <CopyButton value={runId} label="Copy run id" />
              </span>
              <Figure label="hires" value={hires} />
              <Figure label="settled" value={settlements} tone="text-settled" />
              <span className="flex items-baseline gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">spent</span>
                <span className="tabular font-medium">{spend ?? '—'}</span>
              </span>
              <span role="status" className="ml-auto">
                {running && stream !== 'open' ? (
                  <Badge tone="refused" dot>
                    reconnecting…
                  </Badge>
                ) : running ? (
                  <Badge tone="live" dot>
                    live
                  </Badge>
                ) : finished && failed ? (
                  <Badge tone="broken">failed</Badge>
                ) : finished ? (
                  <Badge tone="settled">finished</Badge>
                ) : null}
              </span>
            </div>
            <Progress phase={phase} running={running} failed={failed} />
            {finished && failed && isModelFailure(failure) && (
              <ModelFailureNotice error={failure!} lastDelivered={model?.lastDelivered ?? null} />
            )}
            {finished && failed && !isModelFailure(failure) && (
              <ErrorState title="The run did not deliver">
                {failure ?? 'No agent delivered a result. The steps below say why.'}
              </ErrorState>
            )}
            {running && stream === 'lost' && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border border-refused/30 bg-refused/[0.07] px-4 py-3 text-sm sm:flex-row sm:items-center"
              >
                <p className="flex-1 text-refused">
                  The connection to the live trace was lost. The run continues on the server — nothing is
                  cancelled — and this page keeps trying to reconnect.
                </p>
                <Link href={`/runs/${runId}`} className="shrink-0 text-accent underline">
                  Open the run record
                </Link>
              </div>
            )}
          </Card>

          <Card title="Trace" description="Every decision and every transaction, as it happens.">
            <RunTrace events={events} startedAt={startedAt} token={token} live={running} />
          </Card>

          {detail?.steps && detail.steps.length > 0 && (
            <Card title="What each step cost, and why">
              <StepList steps={detail.steps} />
            </Card>
          )}

          {detail?.answer && (
            <Card title="Answer" actions={<CopyButton value={detail.answer} label="Copy answer" showLabel />}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.answer}</p>
            </Card>
          )}

          {finished && (
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={`/runs/${runId}`}>
                Open the shareable record <Icon name="arrowRight" className="size-4" />
              </ButtonLink>
            </div>
          )}
        </section>
      )}

      {/* ── Guide ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="guide-heading" className="space-y-6">
        <Reveal className="space-y-2 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">New here?</p>
          <h2 id="guide-heading" className="display text-3xl">
            Your first run, in three steps
          </h2>
        </Reveal>
        <ol className="grid gap-4 md:grid-cols-3">
          {GUIDE.map((step, i) => (
            <Reveal as="li" key={step.title} index={i}>
              <Card as="div" className="h-full space-y-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg border border-edge bg-raised text-accent">
                    <Icon name={step.icon} />
                  </span>
                  <span className="tabular text-xs text-muted">Step {i + 1}</span>
                </div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
                {step.link && (
                  <Link
                    href={step.link.href}
                    className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                  >
                    {step.link.label} <Icon name="arrowRight" className="size-3.5" />
                  </Link>
                )}
              </Card>
            </Reveal>
          ))}
        </ol>

        {network && (
          <Reveal>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Fact
                label="Protocol fee"
                value={`${(network.protocolFeeBps / 100).toFixed(2)}%`}
                hint="taken from each settled job"
              />
              {network.minJobAmount && (
                <Fact
                  label="Smallest job"
                  value={`${formatUnits(network.minJobAmount, network.paymentToken.decimals)} ${network.paymentToken.symbol}`}
                  hint="the escrow refuses anything cheaper"
                />
              )}
              <Fact
                label="Self-hire"
                value="Refused"
                hint="the escrow rejects a job between two agents of one owner"
              />
            </dl>
          </Reveal>
        )}
        <p className="text-center text-sm text-muted">
          Prefer to run everything yourself, with no key at all? The{' '}
          <Link href="/docs/quickstart#local" className="text-accent hover:underline">
            quickstart
          </Link>{' '}
          runs the full demo locally in about two and a half minutes.
        </p>
      </section>
    </div>
  );
}

function HeroFigure({label, value}: {label: string; value: number}) {
  return (
    <div className="rounded-xl border border-edge bg-surface/60 px-3 py-3 backdrop-blur-sm">
      <dd className="tabular text-2xl font-semibold">
        <CountUp value={value} />
      </dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}

function Figure({label, value, tone = ''}: {label: string; value: number; tone?: string}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className={`tabular font-medium ${tone}`}>
        <CountUp value={value} duration={400} />
      </span>
    </span>
  );
}

function Fact({label, value, hint}: {label: string; value: string; hint: string}) {
  return (
    <div className="rounded-xl border border-edge bg-surface/60 px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{hint}</dd>
    </div>
  );
}

/** Planning → Hiring → Judging → Settling → Done, lit up as it happens. */
function Progress({phase, running, failed}: {phase: number; running: boolean; failed: boolean}) {
  return (
    <ol aria-label="Run progress" className="grid grid-cols-5 gap-2">
      {PHASES.map((phaseName, i) => {
        const last = i === PHASES.length - 1;
        const name = failed && last ? FAILED_PHASE : phaseName;
        const done = i < phase || (!running && i === phase);
        const current = running && i === phase;
        return (
          <li key={name} aria-current={current ? 'step' : undefined} className="space-y-1.5">
            <span className="block h-1 overflow-hidden rounded-full bg-edge">
              <span
                className={
                  'block h-full rounded-full transition-[width,background-color] duration-500 ' +
                  (done && failed && last
                    ? 'w-full bg-broken'
                    : done
                      ? 'w-full bg-settled'
                      : current
                        ? 'w-1/2 bg-accent'
                        : 'w-0')
                }
              />
            </span>
            <span className={`block truncate text-[11px] ${done || current ? 'text-text' : 'text-muted'}`}>
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
