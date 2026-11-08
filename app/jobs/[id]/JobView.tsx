'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActionFeedback,
  errorText,
  useMe,
  useNetwork,
  usePersonAction,
  type TokenInfo,
} from '@/components/market/hooks';
import {DeliveryPanels, useDelivery} from '@/components/market/Evidence';
import {PartyReviewCard} from '@/components/market/Profile';
import {utc} from '@/components/market/ListingCard';
import {Badge} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextArea} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import type {StreamState} from '@/lib/api';
import {gateForDrafts, listingTermsOf} from '@/lib/evidence';
import {subscribeToJob} from '@/lib/job-stream';
import {LIMITS, validateReason} from '@/lib/listing-form';
import {safeHref} from '@/lib/links';
import {
  amountDisplay,
  availableActions,
  eventWords,
  jobStateWords,
  jobTone,
  market,
  partyOf,
  type JobDetail,
  type PersonAction,
} from '@/lib/market';
import {useSession} from '@/lib/session';

/**
 * One job, for anyone with its link; the two parties also get the buttons for
 * what they may do next. The state is said in words, the history comes from
 * the API (with a link to every transaction), and an SSE stream only tells the
 * page when to ask again.
 */

const ACTION_LABEL: Record<PersonAction, string> = {
  create: 'Sign and fund the job',
  accept: 'Accept the job',
  submit: 'Submit the result',
  approve: 'Approve and pay',
  dispute: 'Dispute the result',
  cancel: 'Cancel and refund',
};

export function JobView({jobId}: {jobId: string}) {
  const session = useSession();
  const token = useNetwork();
  const {me, error: meError} = useMe();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState | 'connecting'>('connecting');
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    market
      .job(jobId, controller.signal)
      .then((j) => {
        setJob(j);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [jobId, attempt]);

  // Something happened to the job: ask again, once for a burst of frames.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const stop = subscribeToJob(
      jobId,
      () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(reload, 300);
      },
      setStream,
    );
    return () => {
      clearTimeout(timer.current);
      stop();
    };
  }, [jobId, reload]);

  // Hooks before any early return: a listing job's delivery, read by its parties only.
  const myAgentId = me?.person?.agentId ?? null;
  const party = job ? partyOf(job, myAgentId) : null;
  const terms = job ? listingTermsOf(job) : null;
  const delivery = useDelivery(jobId, terms && session.status === 'in' ? party : null, attempt);

  const back = {href: '/me', label: 'My account'};

  if (error && !job) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Could not load this job" />
        <ErrorState
          title={error}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }
  if (!job) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Job" />
        <div role="status" aria-label="Loading the job" className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const words = jobStateWords(job);
  const actions = gateForDrafts(availableActions(job, myAgentId), terms ? delivery.drafts : undefined);
  const capability = typeof job.spec?.capability === 'string' ? job.spec.capability : null;

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow="Job"
        title={capability ? capability : 'Job'}
        titleClassName="text-2xl sm:text-3xl"
        description={<span data-testid="state-plain">{words.plain}</span>}
        actions={
          <>
            <Badge tone={jobTone(job.state)} dot>
              {words.label}
            </Badge>
            {party && <Badge tone="chain">You are the {party}</Badge>}
          </>
        }
      />

      {job.resultMismatch && (
        <Notice>
          <p role="alert" data-testid="result-mismatch">
            <strong>The delivered result does not match what the chain recorded.</strong> Do not trust it.
            Approving is blocked; if you are the client, dispute it.
          </p>
        </Notice>
      )}

      <Facts job={job} token={token} />

      <Actions
        job={job}
        actions={actions}
        party={party}
        signedIn={session.status === 'in'}
        ready={session.status !== 'loading' && (session.status !== 'in' || me !== null || meError !== null)}
        fromDraft={terms !== null}
        onDone={reload}
      />

      {terms && party && (
        <DeliveryPanels
          jobId={job.jobId}
          party={party}
          jobState={job.state}
          criteria={terms.criteria}
          delivery={delivery}
        />
      )}

      {job.declined && (
        <Card title="The worker declined" labelledBy="declined">
          <p className="whitespace-pre-wrap break-words text-sm">{job.declined.reason}</p>
        </Card>
      )}
      {job.dispute && (
        <Card title="The client’s dispute" labelledBy="dispute">
          <p className="whitespace-pre-wrap break-words text-sm">{job.dispute.reason}</p>
        </Card>
      )}
      {job.result !== null && job.result !== undefined && (
        <Card title="Delivered result" labelledBy="result">
          <pre className="max-h-80 overflow-auto rounded-lg bg-ink/70 p-3 text-xs">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </Card>
      )}

      {party && session.status === 'in' && job.state === 'settled' && (
        <PartyReviewCard jobId={job.jobId} attempt={attempt} />
      )}

      <Timeline job={job} stream={stream} />
    </div>
  );
}

function Facts({job, token}: {job: JobDetail; token: TokenInfo | null}) {
  const fee = job.fee !== null && token ? amountDisplay(job.fee, token.decimals, token.symbol) : null;
  const receives =
    job.fee !== null && token && BigInt(job.amount) >= BigInt(job.fee)
      ? amountDisplay((BigInt(job.amount) - BigInt(job.fee)).toString(), token.decimals, token.symbol)
      : null;
  const rows: [string, string][] = [
    ['Price', job.amountDisplay],
    ['Protocol fee', fee ?? (job.fee === null ? 'Set when the job settles' : '—')],
    ['Worker receives', receives ?? (job.fee === null ? 'The price minus the fee' : '—')],
    ['Network', job.network],
    ['On chain as', job.chainJobId ? `job ${job.chainJobId}` : 'not on chain yet'],
    ['Created', utc(job.createdAt)],
    ['Settled', job.settledAt ? utc(job.settledAt) : '—'],
  ];
  return (
    <Card title="The job" labelledBy="facts">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular text-right" data-testid={`fact-${k.toLowerCase().replace(/\s+/g, '-')}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Timeline({job, stream}: {job: JobDetail; stream: StreamState | 'connecting'}) {
  return (
    <Card
      title="History"
      labelledBy="timeline"
      actions={
        <span className="text-xs text-muted" aria-live="polite" data-testid="stream-state">
          {stream === 'open'
            ? 'Live'
            : stream === 'connecting'
              ? 'Connecting…'
              : stream === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connection lost, retrying'}
        </span>
      }
    >
      {job.events.length === 0 ? (
        <p className="text-sm text-muted">Nothing has happened yet.</p>
      ) : (
        <ol className="space-y-3">
          {job.events.map((e, i) => {
            const href = safeHref(e.explorerUrl);
            return (
              <li
                key={`${e.kind}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span>
                  {eventWords(e.kind)}
                  <span className="ml-2 text-xs text-muted">{utc(e.occurredAt)}</span>
                </span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent underline"
                  >
                    View transaction
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function Actions({
  job,
  actions,
  party,
  signedIn,
  ready,
  fromDraft,
  onDone,
}: {
  job: JobDetail;
  actions: PersonAction[];
  party: 'client' | 'worker' | null;
  signedIn: boolean;
  /** The session and the person record are known, so "you are not a party" is true, not just early. */
  ready: boolean;
  /** A listing job: the submission is the accepted draft, so there is nothing to type. */
  fromDraft: boolean;
  onDone: () => void;
}) {
  const person = usePersonAction(onDone);
  const [output, setOutput] = useState('{\n  \n}');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [open, setOpen] = useState<'submit' | 'dispute' | null>(null);
  const {state} = person;
  const explorer = state.done ? safeHref(state.done.explorerUrl) : null;

  if (!ready) return <Skeleton className="h-10 w-full" />;
  if (!signedIn) {
    return (
      <Notice tone="live">
        Are you the client or the worker?{' '}
        <Link href="/signin" className="underline">
          Sign in
        </Link>{' '}
        to act on this job.
      </Notice>
    );
  }

  function submitResult() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return setFieldError('That is not valid JSON.');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return setFieldError('The output has to be a JSON object, like {"answer": "…"}.');
    setFieldError(null);
    void person.run(job.jobId, 'submit', {
      output: parsed as Record<string, unknown>,
      producedAt: new Date().toISOString(),
    });
  }

  function disputeResult() {
    const problem = validateReason(reason);
    setFieldError(problem);
    if (problem) return;
    void person.run(job.jobId, 'dispute', {reason: reason.trim()});
  }

  const pending = state.busy || state.pending !== null;

  return (
    <>
      {actions.length > 0 && (
        <Card
          title="Your move"
          labelledBy="actions"
          description={party ? `You are the ${party}.` : undefined}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {actions
                .filter((a) => a !== 'submit' && a !== 'dispute')
                .map((a) => (
                  <Button
                    key={a}
                    variant={a === 'cancel' ? 'danger' : 'primary'}
                    disabled={pending}
                    onClick={() => {
                      setOpen(null);
                      void person.run(job.jobId, a);
                    }}
                  >
                    {ACTION_LABEL[a]}
                  </Button>
                ))}
              {actions.includes('submit') && fromDraft && (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => {
                    setOpen(null);
                    void person.run(job.jobId, 'submit');
                  }}
                >
                  Sign and submit the accepted draft
                </Button>
              )}
              {actions.includes('submit') && !fromDraft && (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => setOpen(open === 'submit' ? null : 'submit')}
                >
                  {ACTION_LABEL.submit}
                </Button>
              )}
              {actions.includes('dispute') && (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => setOpen(open === 'dispute' ? null : 'dispute')}
                >
                  {ACTION_LABEL.dispute}
                </Button>
              )}
            </div>

            {open === 'submit' && actions.includes('submit') && (
              <div className="space-y-3 rounded-lg border border-edge-strong p-4">
                <Field
                  label="Result (a JSON object)"
                  htmlFor="job-output"
                  error={fieldError}
                  hintId="job-output-hint"
                  hint="It is checked against what the client asked for. Its hash goes on chain; the client can compare."
                >
                  <TextArea
                    id="job-output"
                    rows={6}
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    spellCheck={false}
                    className="font-mono"
                    aria-describedby="job-output-hint"
                    aria-invalid={Boolean(fieldError) || undefined}
                  />
                </Field>
                <Button disabled={pending} onClick={submitResult}>
                  Sign and submit
                </Button>
              </div>
            )}
            {open === 'dispute' && actions.includes('dispute') && (
              <div className="space-y-3 rounded-lg border border-edge-strong p-4">
                <Field
                  label="Why is the result not acceptable?"
                  htmlFor="job-reason"
                  error={fieldError}
                  hintId="job-reason-hint"
                  hint={`${LIMITS.reason.min}-${LIMITS.reason.max} characters. A dispute needs a bond, and the arbiter reads this.`}
                >
                  <TextArea
                    id="job-reason"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-describedby="job-reason-hint"
                    aria-invalid={Boolean(fieldError) || undefined}
                  />
                </Field>
                <Button variant="danger" disabled={pending} onClick={disputeResult}>
                  Sign and dispute
                </Button>
              </div>
            )}
            <ActionFeedback state={state} recheck={() => void person.recheck()} />
          </div>
        </Card>
      )}

      {/* The job can move on chain while an action is still being confirmed
          (the indexer saw it first), and then "Your move" has no buttons and
          disappears. The action's progress, its error and "Check again" must
          not disappear with it. */}
      {actions.length === 0 && (state.busy || state.pending !== null || state.error) && (
        <Card title="Your last action" labelledBy="last-action">
          <ActionFeedback state={state} recheck={() => void person.recheck()} />
        </Card>
      )}

      {state.done && (
        <Notice tone="live">
          <p role="status" data-testid="action-done">
            Done: the job is now{' '}
            {jobStateWords({
              state: state.done.state,
              chainJobId: state.done.chainJobId,
              declined: null,
            }).label.toLowerCase()}
            .
            {explorer && (
              <>
                {' '}
                <a href={explorer} target="_blank" rel="noopener noreferrer" className="underline">
                  View transaction
                </a>
              </>
            )}
            {state.done.resultMismatch && ' The chain recorded a different result than the one delivered.'}
          </p>
        </Notice>
      )}

      {actions.length === 0 && party && (
        <p className="text-sm text-muted" data-testid="no-action">
          You are the {party}. There is nothing for you to do right now.
        </p>
      )}
      {!party && (
        <p className="text-sm text-muted" data-testid="not-a-party">
          You are not the client or the worker on this job, so you can only watch it.{' '}
          <ButtonLink href="/jobs" size="sm" variant="ghost">
            Browse jobs
          </ButtonLink>
        </p>
      )}
    </>
  );
}
