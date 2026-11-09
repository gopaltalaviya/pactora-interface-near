'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActionFeedback,
  useMe,
  useNetwork,
  usePersonAction,
  useSignInHref,
  type TokenInfo,
} from '@/components/market/hooks';
import {DisputeEvidenceCard, JudgeCard} from '@/components/market/Dispute';
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
import {describeError, type ErrorView} from '@/lib/errors';
import {gateForDrafts, listingTermsOf, type DraftPhase} from '@/lib/evidence';
import {subscribeToJob} from '@/lib/job-stream';
import {LIMITS, validateReason} from '@/lib/listing-form';
import {safeHref} from '@/lib/links';
import {
  amountDisplay,
  availableActions,
  eventWords,
  jobStateWords,
  jobTitle,
  jobTone,
  market,
  partyOf,
  type JobDetail,
  type PersonAction,
} from '@/lib/market';
import {PERSON_METHODS} from '@/lib/wallet-guard';
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
  decline: 'Decline the job',
};

export function JobView({jobId}: {jobId: string}) {
  const session = useSession();
  const token = useNetwork();
  const {me, error: meError} = useMe();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
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
        if (!controller.signal.aborted) setError(describeError(err));
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

  // Signed in, the way back is the account's jobs; a visitor goes to the public board.
  const back = session.status === 'in' ? {href: '/me', label: 'My account'} : {href: '/jobs', label: 'Jobs'};

  if (error && !job) {
    if (error.notFound) {
      return (
        <div className="space-y-6">
          <PageHeader
            back={back}
            title="This job was not found"
            description="It may have been removed, or the link may be wrong. Check the address you were given."
          />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Could not load this job" />
        <ErrorState
          title={error.text}
          action={
            // Only a failure that can pass (the network, a 5xx) is worth asking again.
            error.retryable ? (
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            ) : undefined
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
  const title = jobTitle(job);
  const capability = typeof job.spec?.capability === 'string' ? job.spec.capability : null;

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow={`Job ${job.jobId.slice(0, 8)}`}
        title={title}
        titleClassName="text-2xl sm:text-3xl"
        description={
          <span className="space-y-1">
            <span className="block" data-testid="state-plain">
              {words.plain}
            </span>
            {(job.listingId || (capability && capability !== title)) && (
              <span className="block text-xs">
                {job.listingId && (
                  <Link
                    href={`/jobs/listing/${encodeURIComponent(job.listingId)}`}
                    className="text-accent underline"
                    data-testid="job-listing-link"
                  >
                    From the listing{job.listingTitle ? ` “${job.listingTitle}”` : ''}
                  </Link>
                )}
                {job.listingId && capability && capability !== title ? ' · ' : ''}
                {capability && capability !== title ? `skill: ${capability}` : ''}
              </span>
            )}
          </span>
        }
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
        token={token}
        actions={actions}
        party={party}
        signedIn={session.status === 'in'}
        ready={session.status !== 'loading' && (session.status !== 'in' || me !== null || meError !== null)}
        fromDraft={terms !== null}
        draftPhase={terms ? delivery.drafts?.phase : undefined}
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
      {party &&
        session.status === 'in' &&
        (job.state === 'submitted' || job.state === 'disputed' || job.dispute) && (
          <DisputeEvidenceCard jobId={job.jobId} party={party} jobState={job.state} attempt={attempt} />
        )}
      {job.judge && <JudgeCard judge={job.judge} />}
      {job.result !== null && job.result !== undefined && <ResultCard result={job.result} />}

      {party && session.status === 'in' && job.state === 'settled' && (
        <PartyReviewCard jobId={job.jobId} attempt={attempt} />
      )}

      <Timeline job={job} stream={stream} />
    </div>
  );
}

/**
 * The delivered result: its known fields as text, the raw JSON behind a
 * toggle (live audit 2026-11-09, L20: raw JSON clipped on a phone). The
 * scrolling pane is focusable and named, so a keyboard reaches it (axe:
 * scrollable-region-focusable).
 */
function ResultCard({result}: {result: unknown}) {
  const fields =
    result && typeof result === 'object' && !Array.isArray(result)
      ? Object.entries(result as Record<string, unknown>).filter(
          ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
        )
      : [];
  return (
    <Card title="Delivered result" labelledBy="result">
      {fields.length > 0 && (
        <dl className="mb-3 space-y-2 text-sm">
          {fields.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="whitespace-pre-wrap break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="text-sm" open={fields.length === 0}>
        <summary className="cursor-pointer text-xs text-muted">The result as JSON</summary>
        <pre
          tabIndex={0}
          role="region"
          aria-label="The delivered result as JSON"
          className="mt-2 max-h-80 overflow-auto rounded-lg bg-ink/70 p-3 text-xs"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </Card>
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

/** A bond as the network sets it: a share of the job, never below the floor. */
function bondOf(amount: string, bps: number | undefined, floor: string | undefined): bigint | null {
  if (bps === undefined) return null;
  const share = (BigInt(amount) * BigInt(bps)) / 10000n;
  const min = floor ? BigInt(floor) : 0n;
  return share > min ? share : min;
}

/**
 * What the wallet is about to be asked, in one line, before it opens: the
 * method, the contract and the money. The same facts the allow-list holds the
 * prepared call against (lib/wallet-guard.ts), so what the person reads here
 * is what gets signed, or nothing does.
 */
function willSign(action: PersonAction, job: JobDetail, token: TokenInfo | null): string {
  const method = PERSON_METHODS[action][0];
  const where = `${method} on ${token?.network.contracts.Pactora ?? 'the Pactora contract'}`;
  const price = job.amountDisplay;
  const money = (units: bigint | null) =>
    units !== null && token ? amountDisplay(units.toString(), token.decimals, token.symbol) : 'a bond';
  const n = token?.network;
  switch (action) {
    case 'create':
      return `You will sign: ${where}: ${price} into escrow.`;
    case 'accept':
      return `You will sign: ${where}: no payment; a bond of ${money(bondOf(job.amount, n?.bondBps, n?.minBond))} is locked from your stake until the job settles.`;
    case 'submit':
      return `You will sign: ${where}: no payment; the result’s hash goes on chain.`;
    case 'approve':
      return `You will sign: ${where}: ${price} to the worker, minus the fee.`;
    case 'dispute':
      return `You will sign: ${where}: ${price} stays in escrow; your bond is ${money(bondOf(job.amount, n?.disputeBondBps, n?.minDisputeBond))}, returned if the arbiter rules for you.`;
    case 'cancel':
      return `You will sign: ${where}: ${price} back to you. Cancelling is possible only until the worker accepts.`;
    case 'decline':
      return 'Nothing is signed: declining is recorded by Pactora, the client is told at once, and the job stays theirs to cancel for a refund.';
  }
}

function Actions({
  job,
  token,
  actions,
  party,
  signedIn,
  ready,
  fromDraft,
  draftPhase,
  onDone,
}: {
  job: JobDetail;
  token: TokenInfo | null;
  actions: PersonAction[];
  party: 'client' | 'worker' | null;
  signedIn: boolean;
  /** The session and the person record are known, so "you are not a party" is true, not just early. */
  ready: boolean;
  /** A listing job: the submission is the accepted draft, so there is nothing to type. */
  fromDraft: boolean;
  /** A listing job's delivery phase, so "nothing to do" is never said while a draft waits for this party. */
  draftPhase: DraftPhase | undefined;
  onDone: () => void;
}) {
  const person = usePersonAction(onDone);
  const signInHref = useSignInHref();
  const [output, setOutput] = useState('{\n  \n}');
  const [reason, setReason] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  // One error per form: a problem with the result never shows under the reason.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [open, setOpen] = useState<'submit' | 'dispute' | 'decline' | null>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const declineRef = useRef<HTMLTextAreaElement>(null);
  const {state} = person;
  const explorer = state.done ? safeHref(state.done.explorerUrl) : null;

  // An inline form that opens takes focus, so a keyboard user is in it, not still on the button.
  useEffect(() => {
    if (open === 'submit') outputRef.current?.focus();
    if (open === 'dispute') reasonRef.current?.focus();
    if (open === 'decline') declineRef.current?.focus();
  }, [open]);

  if (!ready) return <Skeleton className="h-10 w-full" />;
  if (!signedIn) {
    return (
      <Notice tone="live">
        Are you the client or the worker?{' '}
        <Link href={signInHref} className="underline">
          Sign in
        </Link>{' '}
        to act on this job.
      </Notice>
    );
  }

  // What the page knows about the job, for the allow-list on the prepared call.
  const expected = {chainJobId: job.chainJobId, amount: job.amount};

  function submitResult() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      setSubmitError('That is not valid JSON.');
      outputRef.current?.focus();
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setSubmitError('The output has to be a JSON object, like {"answer": "…"}.');
      outputRef.current?.focus();
      return;
    }
    setSubmitError(null);
    void person.run(
      job.jobId,
      'submit',
      {output: parsed as Record<string, unknown>, producedAt: new Date().toISOString()},
      expected,
    );
  }

  function declineJob() {
    const t = declineReason.trim();
    const problem =
      t.length < 1 ? 'Say why, in a sentence.' : t.length > 500 ? 'At most 500 characters.' : null;
    setDeclineError(problem);
    if (problem) {
      declineRef.current?.focus();
      return;
    }
    void person.run(job.jobId, 'decline', {reason: t}, expected);
  }

  function disputeResult() {
    const problem = validateReason(reason);
    setDisputeError(problem);
    if (problem) {
      reasonRef.current?.focus();
      return;
    }
    void person.run(job.jobId, 'dispute', {reason: reason.trim()}, expected);
  }

  const pending = state.busy || state.pending !== null;
  const idle =
    party === 'client' && draftPhase === 'awaiting_review'
      ? 'Review the draft below.'
      : party === 'worker' && draftPhase === 'revise'
        ? 'The client asked for a revision: post the next draft below.'
        : 'There is nothing for you to do right now.';

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
                .filter((a) => a !== 'submit' && a !== 'dispute' && a !== 'decline')
                .map((a) => (
                  <Button
                    key={a}
                    variant={a === 'cancel' ? 'danger' : 'primary'}
                    disabled={pending}
                    onClick={() => {
                      setOpen(null);
                      void person.run(job.jobId, a, {}, expected);
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
                    void person.run(job.jobId, 'submit', {}, expected);
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
              {actions.includes('decline') && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  aria-expanded={open === 'decline'}
                  onClick={() => setOpen(open === 'decline' ? null : 'decline')}
                >
                  {ACTION_LABEL.decline}
                </Button>
              )}
            </div>

            {/* Before the wallet opens: the method, the contract, the money. */}
            <ul className="space-y-1 text-xs text-muted" aria-label="What you will sign">
              {actions
                .filter((a) => a !== 'dispute' && a !== 'decline' && (a !== 'submit' || fromDraft))
                .map((a) => (
                  <li key={a} data-testid={`will-sign-${a}`}>
                    {willSign(a, job, token)}
                  </li>
                ))}
            </ul>

            {open === 'submit' && actions.includes('submit') && (
              <div className="space-y-3 rounded-lg border border-edge-strong p-4">
                <Field
                  label="Result (a JSON object)"
                  htmlFor="job-output"
                  error={submitError}
                  hintId="job-output-hint"
                  hint="It is checked against what the client asked for. Its hash goes on chain; the client can compare."
                >
                  <TextArea
                    id="job-output"
                    ref={outputRef}
                    rows={6}
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    spellCheck={false}
                    className="font-mono"
                    aria-describedby="job-output-hint"
                    aria-invalid={Boolean(submitError) || undefined}
                  />
                </Field>
                <p className="text-xs text-muted" data-testid="will-sign-submit">
                  {willSign('submit', job, token)}
                </p>
                <Button disabled={pending} onClick={submitResult}>
                  Sign and submit
                </Button>
              </div>
            )}
            {open === 'decline' && actions.includes('decline') && (
              <div className="space-y-3 rounded-lg border border-edge-strong p-4" data-testid="decline-form">
                <Field
                  label="Why are you declining?"
                  htmlFor="job-decline-reason"
                  error={declineError}
                  hintId="job-decline-hint"
                  hint="1-500 characters. The client reads it at once. Nothing is signed; the job goes back to the client, who cancels it for a refund."
                >
                  <TextArea
                    id="job-decline-reason"
                    ref={declineRef}
                    rows={3}
                    value={declineReason}
                    maxLength={500}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    aria-describedby="job-decline-hint"
                    aria-invalid={Boolean(declineError) || undefined}
                  />
                </Field>
                <p className="text-xs text-muted" data-testid="will-sign-decline">
                  {willSign('decline', job, token)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={pending} onClick={declineJob}>
                    Confirm: decline the job
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setOpen(null)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
            {open === 'dispute' && actions.includes('dispute') && (
              <div className="space-y-3 rounded-lg border border-edge-strong p-4">
                <Field
                  label="Why is the result not acceptable?"
                  htmlFor="job-reason"
                  error={disputeError}
                  hintId="job-reason-hint"
                  hint={`${LIMITS.reason.min}-${LIMITS.reason.max} characters. A dispute needs a bond, and the arbiter reads this.`}
                >
                  <TextArea
                    id="job-reason"
                    ref={reasonRef}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-describedby="job-reason-hint"
                    aria-invalid={Boolean(disputeError) || undefined}
                  />
                </Field>
                <p className="text-xs text-muted" data-testid="will-sign-dispute">
                  {willSign('dispute', job, token)}
                </p>
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
            {state.done.action === 'decline'
              ? 'Done: you declined the job. The client has been told.'
              : `Done: the job is now ${jobStateWords({
                  state: state.done.state,
                  chainJobId: state.done.chainJobId,
                  declined: null,
                }).label.toLowerCase()}.`}
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
          You are the {party}. {idle}
          {party === 'client' && job.state === 'accepted'
            ? ' Cancelling is possible only before the worker accepts; from here the job ends by delivery, a deadline or a dispute.'
            : ''}
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
