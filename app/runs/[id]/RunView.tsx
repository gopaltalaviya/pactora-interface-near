'use client';

import {useEffect, useState} from 'react';
import {RunTrace, type TraceToken} from '@/components/RunTrace';
import {StepList} from '@/components/StepList';
import {Badge, type Tone} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {CopyButton} from '@/components/ui/CopyButton';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {ModelFailureNotice, isModelFailure} from '@/components/ModelNotice';
import {ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {ApiError, api, type RunDetail, type RunEvent} from '@/lib/api';
import {duration} from '@/lib/format';

/**
 * One run, after the fact.
 *
 * The same trace the demo page streams live, read back from the durable
 * record — so a run can be shared as a link and read later, with every
 * on-chain line carrying its explorer link. Public by design: the trace is
 * the evidence, and evidence nobody can open is not evidence.
 */

const STATE_TONE: Record<RunDetail['state'], Tone> = {running: 'live', done: 'settled', failed: 'broken'};

export function RunView({runId}: {runId: string}) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<{message: string; missing: boolean} | null>(null);
  const [token, setToken] = useState<TraceToken | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => setPageUrl(window.location.href), []);

  // Only for formatting the total; the trace still renders without it.
  useEffect(() => {
    const controller = new AbortController();
    api
      .network(controller.signal)
      .then((n) => setToken(n.paymentToken))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRun(null);
    setError(null);
    api
      .run(runId, controller.signal)
      .then(setRun)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const missing = err instanceof ApiError && err.code === 'NOT_FOUND';
        setError({
          missing,
          message: missing
            ? 'There is no run at this address.'
            : err instanceof Error
              ? err.message
              : 'could not load this run',
        });
      });
    return () => controller.abort();
  }, [runId, attempt]);

  const back = {href: '/runs', label: 'Runs'};

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={error.missing ? 'Run not found' : 'Could not load this run'} />
        <ErrorState
          title={error.message}
          action={
            error.missing ? (
              <ButtonLink href="/" size="sm">
                Start a run
              </ButtonLink>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                <Icon name="refresh" className="size-3.5" /> Retry
              </Button>
            )
          }
        >
          {error.missing
            ? 'Run links carry a long random id; check the link was copied whole.'
            : 'Nothing was spent and nothing was signed — this page only reads.'}
        </ErrorState>
      </div>
    );
  }

  if (!run) {
    return (
      <Loading label="Loading this run">
        <div className="space-y-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-3/4" />
          <div className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </Loading>
    );
  }

  const events: RunEvent[] = run.events.map((e) => ({
    kind: e.kind as RunEvent['kind'],
    payload: e.payload,
    at: Date.parse(e.occurredAt),
  }));
  const settled = run.steps.filter((s) => s.status === 'settled').length;
  const took = run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        back={back}
        eyebrow="Run record"
        title={run.goal}
        titleClassName="text-2xl sm:text-3xl"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <Badge tone={STATE_TONE[run.state]} dot={run.state === 'running'}>
              {run.state}
            </Badge>
            <span className="tabular inline-flex items-center">
              run {run.runId}
              <CopyButton value={run.runId} label="Copy run id" />
            </span>
            <span>{run.network}</span>
            <span>
              spent <span className="tabular">{run.spentDisplay}</span>
            </span>
            <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>
          </span>
        }
        actions={
          pageUrl ? (
            <CopyButton
              value={pageUrl}
              label="Copy link to this run"
              showLabel
              className="border border-edge px-3 py-1.5"
            />
          ) : null
        }
      />

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Steps" value={String(run.steps.length)} />
        <Summary label="Settled on chain" value={`${settled} / ${run.steps.length}`} tone="text-settled" />
        <Summary label="Spent" value={run.spentDisplay} />
        <Summary
          label="Took"
          value={took === null ? (run.state === 'running' ? 'running' : '—') : duration(took)}
        />
      </section>

      {run.answer && (
        <Card title="Answer" actions={<CopyButton value={run.answer} label="Copy answer" showLabel />}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{run.answer}</p>
        </Card>
      )}

      {run.error && isModelFailure(run.error) && <ModelFailureNotice error={run.error} />}
      {run.error && !isModelFailure(run.error) && <ErrorState title="The run failed">{run.error}</ErrorState>}

      {run.steps.length > 0 && (
        <Card
          title="Steps"
          description="What was commissioned, how it ended, and the transaction that proves it."
        >
          <StepList steps={run.steps} proof />
        </Card>
      )}

      <Card title="Trace" description="Every decision and every transaction, in order.">
        <RunTrace events={events} startedAt={Date.parse(run.startedAt)} token={token} />
      </Card>
    </div>
  );
}

function Summary({label, value, tone = ''}: {label: string; value: string; tone?: string}) {
  return (
    <div className="rounded-xl border border-edge bg-surface/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
