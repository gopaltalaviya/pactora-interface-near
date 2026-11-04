'use client';

import Link from 'next/link';
import {useId, useState} from 'react';
import {Badge, type Tone} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, SecretInput} from '@/components/ui/Field';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {api, type RunSummary} from '@/lib/api';
import {relativeTime} from '@/lib/format';
import {shortId} from '@/lib/links';

/**
 * Run history.
 *
 * `/v1/runs` has existed since the runs API was built, and nothing rendered
 * it: a run was visible only while it was happening. This is the record
 * afterwards — every goal an orchestrator was given, what it spent, and a
 * link to the full trace.
 *
 * The list needs the orchestrator's key, because a run history is that
 * agent's own business. As on the demo page, the key is used for the request
 * and never stored. A single run's trace is public — anyone holding its link
 * can read it — which is what makes a run shareable as evidence.
 */

const STATE_TONE: Record<RunSummary['state'], Tone> = {
  running: 'live',
  done: 'settled',
  failed: 'broken',
};

export default function RunsPage() {
  const [key, setKey] = useState('');
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = {key: useId(), note: useId()};

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setRuns(await api.runs(key.trim()));
    } catch (err) {
      setRuns(null);
      setError(err instanceof Error ? err.message : 'could not list runs');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="History"
        title="Runs"
        description="Every goal an orchestrator was given, what it spent, and how each step ended. Open one for the full trace — plan, hires, verdicts and settlements, each with its transaction."
      />

      <Card>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) void load();
          }}
        >
          <Field
            label="Orchestrator API key"
            htmlFor={ids.key}
            hintId={ids.note}
            hint="The key is used for this request only — it is never stored. A run history is that agent's own business; a single run's link is public."
          >
            <SecretInput
              id={ids.key}
              value={key}
              onChange={setKey}
              aria-describedby={ids.note}
              placeholder="Orchestrator API key (ax_…)"
            />
          </Field>
          <Button type="submit" disabled={!key.trim()} loading={loading} className="sm:mt-[1.625rem]">
            {loading ? 'Loading…' : 'Show runs'}
          </Button>
        </form>
      </Card>

      {error && (
        <ErrorState
          title="Could not list runs"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={!key.trim()}>
              <Icon name="refresh" className="size-3.5" /> Retry
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}

      {loading && !runs && (
        <Loading label="Loading runs">
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </Loading>
      )}

      {!runs && !loading && !error && (
        <EmptyState icon="key" title="Enter an orchestrator key to see its runs">
          Each run is also reachable by its own link — the demo shows it the moment a run starts.
        </EmptyState>
      )}

      {runs && runs.length === 0 && (
        <EmptyState
          icon="activity"
          title="This orchestrator has no runs yet."
          action={
            <Link href="/" className="text-sm text-accent hover:underline">
              Start one from the demo
            </Link>
          }
        />
      )}

      {runs && runs.length > 0 && (
        <section aria-label="Runs" className="space-y-3">
          <p className="text-xs text-muted" aria-live="polite">
            {runs.length} run{runs.length === 1 ? '' : 's'}, newest first
          </p>
          <ul className="stagger space-y-2">
            {runs.map((run, i) => (
              <li key={run.runId} style={{'--i': i} as React.CSSProperties}>
                <Link
                  href={`/runs/${run.runId}`}
                  className="card-interactive group flex items-center gap-4 rounded-xl border border-edge bg-surface/80 px-4 py-3.5 backdrop-blur-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="truncate text-sm font-medium">{run.goal}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <Badge tone={STATE_TONE[run.state]} dot={run.state === 'running'}>
                        {run.state}
                      </Badge>
                      <span className="tabular" title={run.runId}>
                        run {shortId(run.runId)}
                      </span>
                      <span className="tabular">spent {run.spentDisplay}</span>
                      <time dateTime={run.startedAt} title={new Date(run.startedAt).toLocaleString()}>
                        {relativeTime(run.startedAt)}
                      </time>
                    </div>
                  </div>
                  <Icon
                    name="arrowRight"
                    className="size-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
