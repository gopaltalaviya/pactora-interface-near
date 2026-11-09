'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {
  ActionFeedback,
  errorText,
  useNetwork,
  usePersonAction,
  useSignInHref,
  type TokenInfo,
} from '@/components/market/hooks';
import {PriceLine, STATUS_TONE, utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, Select, TextArea, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {ReportButton} from '@/components/market/Report';
import {StandingBanner} from '@/components/market/Standing';
import {subscribeToJob} from '@/lib/job-stream';
import {safeHref} from '@/lib/links';
import {LIMITS, validateBid, validateReason} from '@/lib/listing-form';
import {refreshNotifications} from '@/lib/notifications';
import {
  amountDisplay,
  bidStanding,
  market,
  MAX_BIDS_PER_LISTING,
  receivesDisplay,
  windowDisplay,
  type Application,
  type ApplicantApplication,
  type ApplicationSort,
  type Decision,
  type ListingDetail,
} from '@/lib/market';
import {parseUnits} from '@/lib/near';
import {useSession} from '@/lib/session';

/**
 * One listing. Everyone sees what is asked. The person who posted it also sees
 * the bids and the controls; anyone else sees their own bids and a form to bid
 * (or a button to claim a slot, when hiring is instant). Which one is decided
 * by the API's `viewer` field, not by this page guessing from the account.
 */

/** Whether a media query matches now; false until mounted (the server cannot know). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function ListingView({listingId}: {listingId: string}) {
  const session = useSession();
  const token = useNetwork();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const {status, authed} = session;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    setError(null);
    const load =
      status === 'in'
        ? authed((t) => market.listing(listingId, t, controller.signal))
        : market.listing(listingId, undefined, controller.signal);
    load.then(setListing).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(errorText(err));
    });
    return () => controller.abort();
  }, [status, authed, listingId, attempt]);

  // A worker's page never learned they were hired (live audit 2026-11-09, M6):
  // while the viewer has a live bid, ask again every 15 s, and follow the job's
  // own stream once a bid is selected.
  const liveBid =
    listing?.viewer && !listing.viewer.isOwner
      ? listing.viewer.applications.find((a) => a.status === 'pending' || a.status === 'selected')
      : undefined;
  const liveBidKey = liveBid ? `${liveBid.applicationId}:${liveBid.status}:${liveBid.jobId ?? ''}` : null;
  useEffect(() => {
    if (!liveBidKey) return;
    const timer = setInterval(reload, 15_000);
    const jobId = liveBidKey.split(':')[2];
    const stop = jobId ? subscribeToJob(jobId, reload) : () => undefined;
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [liveBidKey, reload]);

  const back = {href: '/jobs', label: 'Jobs'};

  if (error && !listing) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Could not load this listing" />
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
  if (!listing) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Listing" />
        <div role="status" aria-label="Loading the listing" className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const owner = listing.viewer?.isOwner === true;
  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow={owner ? 'Your listing' : 'Listing'}
        title={listing.title}
        titleClassName="text-2xl sm:text-3xl"
        actions={
          <>
            <Badge tone={STATUS_TONE[listing.status]}>{listing.status}</Badge>
            <Badge tone="chain">{listing.category}</Badge>
            <Badge>{listing.interactionMode}</Badge>
            {listing.hiringMode === 'instant' && <Badge tone="live">instant hiring</Badge>}
            {listing.hidden && <Badge tone="refused">hidden by moderation</Badge>}
          </>
        }
      />

      {!owner && <StandingBanner />}
      <Details listing={listing} token={token} />
      {!owner && (
        <div className="flex justify-end">
          <ReportButton targetType="listing" targetId={listing.listingId} what="this listing" />
        </div>
      )}

      {owner && listing.viewer?.isOwner ? (
        <OwnerPanel listing={listing} slots={listing.viewer.slots} token={token} reload={reload} />
      ) : (
        <ApplicantPanel
          listing={listing}
          mine={listing.viewer && !listing.viewer.isOwner ? listing.viewer.applications : []}
          token={token}
          reload={reload}
        />
      )}
    </div>
  );
}

function Details({listing, token}: {listing: ListingDetail; token: TokenInfo | null}) {
  const rows: [string, ReactNode][] = [
    ['Posted by', `${listing.client.name} (${listing.client.kind})`],
    ['Deadline', utc(listing.deadline)],
    ['Estimated effort', `${listing.estimatedMinutes} min per worker`],
    ['Location', listing.location || 'Anywhere'],
    ['Slots', `${listing.slotsFilled} of ${listing.maxWorkers} filled`],
    ['Time to accept', windowDisplay(listing.acceptWindowSeconds)],
    ['Time to do the work', windowDisplay(listing.workWindowSeconds)],
  ];
  const fee = token ? amountDisplay(listing.feeAtCeilingBaseUnits, token.decimals, token.symbol) : null;
  return (
    <Card title="What is asked" labelledBy="asked">
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap break-words">{listing.description}</p>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Acceptance criteria</h3>
            <p className="mt-1 whitespace-pre-wrap break-words">{listing.criteria}</p>
          </div>
          {listing.skills.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
              {listing.skills.map((s) => (
                <li key={s}>
                  <Tag>{s}</Tag>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          <PriceLine listing={listing} token={token} />
          {fee && <p className="text-xs text-muted">Fee at the ceiling: {fee}</p>}
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}

// ─── someone who is not the owner ────────────────────────────────────────────

function ApplicantPanel({
  listing,
  mine,
  token,
  reload,
}: {
  listing: ListingDetail;
  mine: Application[];
  token: TokenInfo | null;
  reload: () => void;
}) {
  const session = useSession();
  const [price, setPrice] = useState('');
  const [proposal, setProposal] = useState('');
  const [errors, setErrors] = useState<{price?: string; proposal?: string}>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Decision | null>(null);
  // L1: a bid is withdrawn on the second click, not the first.
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const decimals = token?.decimals ?? 6;
  const signIn = useSignInHref();

  if (session.status === 'loading') return null;
  if (session.status === 'out') {
    return (
      <Card title="Want this work?" labelledBy="bid-gate">
        <p className="text-sm text-muted">Sign in with your NEAR account to bid on this listing.</p>
        <div className="mt-4">
          <ButtonLink href={signIn} variant="primary">
            Sign in
          </ButtonLink>
        </div>
      </Card>
    );
  }
  if (!session.person) {
    return (
      <Card title="Want this work?" labelledBy="bid-gate">
        <p className="text-sm text-muted">Bidding needs a person record on Pactora.</p>
        <div className="mt-4">
          <ButtonLink href="/join" variant="primary">
            Join as a person
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const standing = bidStanding(mine);
  const open = listing.status === 'open';

  async function apply(e: FormEvent) {
    e.preventDefault();
    const {errors: found, body} = validateBid(price, proposal, {
      decimals,
      ceiling: listing.maxPriceBaseUnits,
    });
    setErrors(found);
    setError(null);
    if (!body) return;
    setBusy('apply');
    try {
      await session.authed((t) => market.apply(t, listing.listingId, body));
      setPrice('');
      setProposal('');
      refreshNotifications();
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(applicationId: string) {
    setBusy(`withdraw-${applicationId}`);
    setError(null);
    try {
      await session.authed((t) => market.withdraw(t, listing.listingId, applicationId));
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
      setConfirmWithdraw(null);
    }
  }

  async function claim() {
    setBusy('claim');
    setError(null);
    try {
      setClaimed(await session.authed((t) => market.claim(t, listing.listingId)));
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {mine.length > 0 && (
        <Card
          title="Your bids"
          labelledBy="my-bids"
          description={`${standing.used} of ${MAX_BIDS_PER_LISTING} bids used on this listing.`}
        >
          <ul className="space-y-3">
            {mine.map((a) => (
              <li
                key={a.applicationId}
                className="rounded-lg border border-edge p-3 text-sm"
                data-testid="my-bid"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular font-medium">{a.priceDisplay}</span>
                  <Badge
                    tone={a.status === 'selected' ? 'settled' : a.status === 'pending' ? 'live' : 'neutral'}
                  >
                    {a.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  You would receive{' '}
                  {token
                    ? receivesDisplay(a.workerReceivesBaseUnits, token.decimals, token.symbol)
                    : 'the price minus the fee'}{' '}
                  after the fee.
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-muted">{a.proposal}</p>
                {a.reason && <p className="mt-2 text-xs">The client said: {a.reason}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.status === 'pending' && confirmWithdraw !== a.applicationId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => setConfirmWithdraw(a.applicationId)}
                    >
                      Withdraw this bid
                    </Button>
                  )}
                  {a.status === 'pending' && confirmWithdraw === a.applicationId && (
                    <>
                      <span className="self-center text-xs text-muted">
                        It counts as one of your {MAX_BIDS_PER_LISTING} bids here.
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === `withdraw-${a.applicationId}`}
                        disabled={busy !== null}
                        onClick={() => void withdraw(a.applicationId)}
                      >
                        Confirm withdrawal
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => setConfirmWithdraw(null)}
                      >
                        Keep it
                      </Button>
                    </>
                  )}
                  {a.jobId && (
                    <ButtonLink href={`/jobs/${a.jobId}`} size="sm">
                      Open the job
                    </ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <ErrorState title="That did not go through">{error}</ErrorState>}

      {!open ? (
        <Notice>This listing is {listing.status}, so it is not taking bids.</Notice>
      ) : listing.hiringMode === 'instant' ? (
        <Card title="Take a slot" labelledBy="claim">
          <p className="text-sm text-muted">
            Hiring is instant: the first eligible workers get the slots, at the ceiling price.
          </p>
          {claimed?.job ? (
            <p className="mt-3 text-sm" role="status">
              You have a slot.{' '}
              <Link href={`/jobs/${claimed.job.jobId}`} className="text-accent underline">
                Open your job
              </Link>
              .
            </p>
          ) : (
            <div className="mt-4">
              <Button loading={busy === 'claim'} disabled={busy !== null} onClick={() => void claim()}>
                Claim a slot
              </Button>
            </div>
          )}
        </Card>
      ) : standing.canApply ? (
        <Card title="Bid on this work" labelledBy="bid">
          <form onSubmit={(e) => void apply(e)} noValidate className="space-y-4">
            <Field
              label={`Your price${token?.symbol ? ` (${token.symbol})` : ''}`}
              htmlFor="bid-price"
              error={errors.price}
              hintId="bid-price-hint"
              hint={`At most ${listing.maxPriceDisplay}. The fee comes out of what you receive.`}
            >
              <TextInput
                id="bid-price"
                inputMode="decimal"
                value={price}
                invalid={Boolean(errors.price)}
                onChange={(e) => setPrice(e.target.value)}
                aria-describedby="bid-price-hint"
                autoComplete="off"
                mono
              />
            </Field>
            <Field
              label="Your proposal"
              htmlFor="bid-proposal"
              error={errors.proposal}
              hintId="bid-proposal-hint"
              hint={`${LIMITS.proposal.min}-${LIMITS.proposal.max} characters: why you, and how you will do it.`}
            >
              <TextArea
                id="bid-proposal"
                rows={4}
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                aria-describedby="bid-proposal-hint"
                aria-invalid={Boolean(errors.proposal) || undefined}
              />
            </Field>
            <Button type="submit" loading={busy === 'apply'} disabled={busy !== null}>
              Send my bid
            </Button>
          </form>
        </Card>
      ) : (
        <p
          className="rounded-xl border border-edge bg-surface/80 px-4 py-3 text-sm text-muted"
          data-testid="bid-blocked"
        >
          {standing.blocked}
        </p>
      )}
    </div>
  );
}

// ─── the owner ───────────────────────────────────────────────────────────────

const SORTS: {value: ApplicationSort; label: string}[] = [
  {value: 'recent', label: 'Most recent'},
  {value: 'price_low', label: 'Price, low to high'},
  {value: 'price_high', label: 'Price, high to low'},
  {value: 'rating', label: 'Best rated'},
];

function OwnerPanel({
  listing,
  slots,
  token,
  reload,
}: {
  listing: ListingDetail;
  slots: {slot: number; jobId: string | null}[];
  token: TokenInfo | null;
  reload: () => void;
}) {
  const session = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Buttons that swap out hand focus to their replacement (live audit 2026-11-09, M10).
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmCancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmCancel) confirmCancelButton.current?.focus();
  }, [confirmCancel]);
  const [funding, setFunding] = useState<{
    jobId: string;
    signerId: string | undefined;
    amount: string;
    amountDisplay: string;
  } | null>(null);
  const [signed, setSigned] = useState<{
    jobId: string;
    txHash: string | undefined;
    explorerUrl: string | undefined;
  } | null>(null);
  const action = usePersonAction(() => {
    setFunding(null);
    reload();
  });

  async function simple(label: string, run: (t: string) => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await session.authed(run);
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  }

  const untouched = listing.slotsFilled === 0;

  return (
    <div className="space-y-6">
      <Card title="Manage this listing" labelledBy="manage">
        <div className="flex flex-wrap gap-2">
          {listing.status === 'open' && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'close'}
              disabled={busy !== null}
              onClick={() => void simple('close', (t) => market.close(t, listing.listingId))}
            >
              Stop hiring
            </Button>
          )}
          {listing.status === 'closed' && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'reopen'}
              disabled={busy !== null}
              onClick={() => void simple('reopen', (t) => market.reopen(t, listing.listingId))}
            >
              Reopen
            </Button>
          )}
          {listing.status !== 'cancelled' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null || !untouched}
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
            >
              Edit
            </Button>
          )}
          {listing.status !== 'cancelled' && !confirmCancel && (
            <Button
              ref={cancelButton}
              variant="danger"
              size="sm"
              disabled={busy !== null || !untouched}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel listing
            </Button>
          )}
          {confirmCancel && (
            <>
              <Button
                ref={confirmCancelButton}
                variant="danger"
                size="sm"
                loading={busy === 'cancel'}
                onClick={() => void simple('cancel', (t) => market.cancelListing(t, listing.listingId))}
              >
                Yes, cancel it and reject every bid
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmCancel(false);
                  setTimeout(() => cancelButton.current?.focus(), 0);
                }}
              >
                Keep it
              </Button>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted" data-testid="manage-help">
          {listing.status === 'cancelled'
            ? 'This listing is cancelled: every pending bid was rejected, and nothing more can be done with it.'
            : listing.status === 'closed'
              ? 'Hiring is stopped. Pending bids are set aside (shown as pending, reopenable); reopening before the deadline revives them. Cancelling rejects them instead.'
              : untouched
                ? 'Stopping hiring sets pending bids aside; reopening before the deadline revives them. Cancelling rejects every pending bid. Editing and cancelling are possible until you choose someone.'
                : 'You have chosen a worker, so the listing can no longer be edited or cancelled. You can still stop hiring.'}
        </p>
        {error && (
          <div className="mt-3">
            <ErrorState title="That did not go through">{error}</ErrorState>
          </div>
        )}
        {editing && untouched && (
          <EditForm
            listing={listing}
            token={token}
            onDone={() => {
              setEditing(false);
              reload();
            }}
          />
        )}
      </Card>

      {funding && (
        <Card title="Fund the job" labelledBy="fund">
          <p className="text-sm text-muted">
            The bid is selected, but the job is not on chain yet. Signing creates it and puts the money in
            escrow.
            {funding.signerId ? ` Your wallet must sign as ${funding.signerId}.` : ''}
          </p>
          {/* Before the wallet opens: the method, the contract, the money (held against the prepared call). */}
          <p className="mt-2 text-xs text-muted" data-testid="will-sign-create">
            You will sign: create_job on {token?.network.contracts.Pactora ?? 'the Pactora contract'}:{' '}
            {funding.amountDisplay} into escrow.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              loading={action.state.busy}
              disabled={action.state.busy || action.state.pending !== null}
              onClick={() =>
                void action.run(funding.jobId, 'create', {}, {chainJobId: null, amount: funding.amount})
              }
            >
              Sign and fund the job
            </Button>
            <Link href={`/jobs/${funding.jobId}`} className="text-sm text-accent underline">
              Open the job
            </Link>
          </div>
          <div className="mt-3">
            <ActionFeedback state={action.state} recheck={() => void action.recheck()} />
          </div>
        </Card>
      )}

      {action.state.done && !funding && (
        <Notice tone="live">
          <p role="status" data-testid="funded-by-wallet">
            Funded. The job is on chain and the money is in escrow.{' '}
            <Link href={`/jobs/${action.state.done.jobId}`} className="underline">
              Open the job
            </Link>
          </p>
        </Notice>
      )}

      {signed && (
        <Notice tone="live">
          <p role="status" data-testid="funded-by-signer">
            Selected. Your agent’s signer funded the job
            {signed.explorerUrl && safeHref(signed.explorerUrl) ? (
              <>
                {' '}
                (
                <a
                  href={safeHref(signed.explorerUrl) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  transaction
                </a>
                )
              </>
            ) : null}
            .{' '}
            <Link href={`/jobs/${signed.jobId}`} className="underline">
              Open the job
            </Link>
          </p>
        </Notice>
      )}

      <Card
        title="Slots"
        labelledBy="slots"
        description={`${listing.slotsFilled} of ${listing.maxWorkers} filled`}
      >
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Slots">
          {slots.map((s) => (
            <li
              key={s.slot}
              className="flex items-center justify-between rounded-lg border border-edge px-3 py-2 text-sm"
            >
              <span>Slot {s.slot}</span>
              {s.jobId ? (
                <Link href={`/jobs/${s.jobId}`} className="text-accent underline">
                  Open the job
                </Link>
              ) : (
                <span className="text-muted">open</span>
              )}
            </li>
          ))}
          {slots.length === 0 && <li className="text-sm text-muted">No slot is filled yet.</li>}
        </ul>
      </Card>

      {listing.hiringMode === 'applications' && (
        <Applications
          listing={listing}
          token={token}
          onSelected={(d) => {
            const f = d.funding;
            if (f?.by === 'person' && !f.done && d.job) {
              setFunding({
                jobId: d.job.jobId,
                signerId: f.signerId,
                amount: d.job.amount,
                amountDisplay: d.job.amountDisplay,
              });
              setSigned(null);
            } else if (f?.by === 'signer' && d.job) {
              setSigned({jobId: d.job.jobId, txHash: f.txHash, explorerUrl: f.explorerUrl});
              setFunding(null);
            }
            reload();
          }}
        />
      )}
    </div>
  );
}

function EditForm({
  listing,
  token,
  onDone,
}: {
  listing: ListingDetail;
  token: TokenInfo | null;
  onDone: () => void;
}) {
  const session = useSession();
  const decimals = token?.decimals ?? 6;
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [criteria, setCriteria] = useState(listing.criteria);
  const [price, setPrice] = useState(
    // Back from base units to what a person types.
    (() => {
      const d = listing.maxPriceBaseUnits.padStart(decimals + 1, '0');
      const frac = d.slice(-decimals).replace(/0+$/, '');
      return frac ? `${d.slice(0, -decimals)}.${frac}` : d.slice(0, -decimals);
    })(),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const units = parseUnits(price, decimals);
    if (units === null || /^0+$/.test(units)) return setError('Enter a ceiling above 0.');
    const patch: Record<string, string> = {};
    if (title.trim() !== listing.title) patch['title'] = title.replace(/\s+/g, ' ').trim();
    if (description.trim() !== listing.description) patch['description'] = description.trim();
    if (criteria.trim() !== listing.criteria) patch['criteria'] = criteria.trim();
    if (units !== listing.maxPriceBaseUnits) patch['maxPriceBaseUnits'] = units;
    if (Object.keys(patch).length === 0) return setError('Nothing has changed.');
    setBusy(true);
    try {
      await session.authed((t) => market.updateListing(t, listing.listingId, patch));
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="mt-4 space-y-4 border-t border-edge pt-4"
      aria-label="Edit the listing"
    >
      <Field label="Title" htmlFor="ed-title">
        <TextInput id="ed-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="ed-description">
        <TextArea
          id="ed-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Acceptance criteria" htmlFor="ed-criteria">
        <TextArea id="ed-criteria" rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
      </Field>
      <Field
        label={`Ceiling per worker${token?.symbol ? ` (${token.symbol})` : ''}`}
        htmlFor="ed-price"
        hint="It cannot go below the highest bid still waiting."
      >
        <TextInput
          id="ed-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          mono
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-broken">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Save changes
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </form>
  );
}

function Applications({
  listing,
  token,
  onSelected,
}: {
  listing: ListingDetail;
  token: TokenInfo | null;
  onSelected: (d: Decision) => void;
}) {
  const session = useSession();
  const [sort, setSort] = useState<ApplicationSort>('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{total: number; pageSize: number; rows: ApplicantApplication[]} | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [deciding, setDeciding] = useState<{id: string; action: 'select' | 'reject'} | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {authed} = session;
  // The decision panel opens next to the chosen bid, takes focus, closes on
  // Escape and hands focus back to the button that opened it (M10, M26).
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // The cards (below md) and the table (from md) are both in the markup; the
  // form is rendered in whichever is shown, so there is one of it.
  const wide = useMediaQuery('(min-width: 768px)');
  useEffect(() => {
    if (deciding) reasonRef.current?.focus();
  }, [deciding]);
  const startDeciding = (e: React.MouseEvent<HTMLButtonElement>, id: string, action: 'select' | 'reject') => {
    opener.current = e.currentTarget;
    setDeciding({id, action});
    setReason('');
    setReasonError(null);
  };
  const stopDeciding = () => {
    setDeciding(null);
    const back = opener.current;
    setTimeout(() => back?.focus(), 0);
  };

  useEffect(() => {
    let live = true;
    setError(null);
    authed((t) => market.applications(t, listing.listingId, {sort, page}))
      .then((r) => live && setData({total: r.total, pageSize: r.pageSize, rows: r.applications}))
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [authed, listing.listingId, sort, page, attempt, listing.updatedAt, listing.slotsFilled]);

  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!deciding) return;
    const problem = validateReason(reason);
    setReasonError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const out = await session.authed((t) =>
        market.decide(t, listing.listingId, {
          applicationId: deciding.id,
          action: deciding.action,
          reason: reason.trim(),
        }),
      );
      setDeciding(null);
      setReason('');
      setAttempt((n) => n + 1);
      refreshNotifications();
      if (deciding.action === 'select') onSelected(out);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const symbol = token?.symbol ?? '';
  const chosen = deciding ? data?.rows.find((r) => r.applicationId === deciding.id) : undefined;

  const decisionForm = deciding ? (
    <form
      onSubmit={(e) => void decide(e)}
      noValidate
      aria-label={deciding.action === 'select' ? 'Select this bid' : 'Reject this bid'}
      className="space-y-3 rounded-lg border border-edge-strong p-4"
    >
      <p className="text-sm">
        {deciding.action === 'select' ? 'Selecting' : 'Rejecting'}{' '}
        <strong>{chosen?.applicant.name ?? 'this bid'}</strong>
        {chosen ? ` at ${chosen.priceDisplay}` : ''}.
      </p>
      <Field
        label={
          deciding.action === 'select'
            ? 'Why this bid? (the worker sees it)'
            : 'Why not? (the applicant sees it)'
        }
        htmlFor="decide-reason"
        error={reasonError}
        hintId="decide-reason-hint"
        hint={`${LIMITS.reason.min}-${LIMITS.reason.max} characters. Escape closes this.`}
      >
        <TextArea
          id="decide-reason"
          ref={reasonRef}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              stopDeciding();
            }
          }}
          aria-describedby="decide-reason-hint"
          aria-invalid={Boolean(reasonError) || undefined}
        />
      </Field>
      {deciding.action === 'select' && (
        <p className="text-xs text-muted">
          Selecting creates a job at the bid price. If you are a person, your wallet signs the funding next.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {deciding.action === 'select' ? 'Confirm selection' : 'Confirm rejection'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={stopDeciding}>
          Never mind
        </Button>
      </div>
    </form>
  ) : null;

  return (
    <Card
      title="Bids"
      labelledBy="bids"
      description={data ? `${data.total} ${data.total === 1 ? 'bid' : 'bids'}` : undefined}
      actions={
        <div className="w-48">
          <Select
            aria-label="Sort bids"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ApplicationSort);
              setPage(1);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      {error && <ErrorState title="That did not go through">{error}</ErrorState>}
      {!data && !error && <Skeleton className="h-24 w-full" />}
      {data && data.rows.length === 0 && (
        <EmptyState icon="users" title="No bids yet">
          Bids appear here as people send them.
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <>
          {/* On a phone the bids read as cards, each with its buttons in reach (live audit 2026-11-09, M5). */}
          <ul aria-label="Bids" className="space-y-3 md:hidden">
            {data.rows.map((a) => (
              <li
                key={a.applicationId}
                className={`space-y-2 rounded-lg border p-3 text-sm ${deciding?.id === a.applicationId ? 'border-accent' : 'border-edge'}`}
                data-testid="bid-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.applicant.name}</span>
                  <Badge
                    tone={a.status === 'selected' ? 'settled' : a.status === 'pending' ? 'live' : 'neutral'}
                  >
                    {a.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  {a.applicant.location || 'no location'} · score {a.applicant.score} ·{' '}
                  {a.applicant.completed} done
                </p>
                <p className="tabular">
                  {a.priceDisplay}
                  <span className="text-xs text-muted">
                    {' '}
                    · receives{' '}
                    {token ? receivesDisplay(a.workerReceivesBaseUnits, token.decimals, symbol) : '—'}
                  </span>
                </p>
                <p className="whitespace-pre-wrap break-words text-xs text-muted">{a.proposal}</p>
                {a.reason && <p className="text-xs text-muted">{a.reason}</p>}
                {a.status === 'pending' && listing.status === 'open' ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      aria-label={`Select ${a.applicant.name}`}
                      disabled={busy}
                      onClick={(e) => startDeciding(e, a.applicationId, 'select')}
                    >
                      Select
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Reject ${a.applicant.name}`}
                      disabled={busy}
                      onClick={(e) => startDeciding(e, a.applicationId, 'reject')}
                    >
                      Reject
                    </Button>
                  </div>
                ) : a.jobId ? (
                  <Link href={`/jobs/${a.jobId}`} className="text-accent underline">
                    Open the job
                  </Link>
                ) : null}
                {!wide && deciding?.id === a.applicationId && decisionForm}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Bids on this listing">
              <caption className="sr-only">Bids on this listing</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Applicant
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Price
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Receives
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Decide
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((a) => (
                  <tr
                    key={a.applicationId}
                    className={`border-t border-edge align-top ${deciding?.id === a.applicationId ? 'bg-accent/5' : ''}`}
                    data-testid="bid-row"
                  >
                    <td className="py-3 pr-3">
                      <div className="font-medium">{a.applicant.name}</div>
                      <div className="text-xs text-muted">
                        {a.applicant.location || 'no location'} · score {a.applicant.score} ·{' '}
                        {a.applicant.completed} done
                      </div>
                      <p className="mt-1 max-w-sm whitespace-pre-wrap break-words text-xs text-muted">
                        {a.proposal}
                      </p>
                    </td>
                    <td className="tabular py-3 pr-3">{a.priceDisplay}</td>
                    <td className="tabular py-3 pr-3">
                      {token ? receivesDisplay(a.workerReceivesBaseUnits, token.decimals, symbol) : '—'}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge
                        tone={
                          a.status === 'selected' ? 'settled' : a.status === 'pending' ? 'live' : 'neutral'
                        }
                      >
                        {a.status}
                      </Badge>
                      {a.reason && (
                        <p className="mt-1 max-w-[12rem] break-words text-xs text-muted">{a.reason}</p>
                      )}
                    </td>
                    <td className="py-3">
                      {a.status === 'pending' && listing.status === 'open' ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            aria-label={`Select ${a.applicant.name}`}
                            disabled={busy}
                            aria-expanded={deciding?.id === a.applicationId && deciding.action === 'select'}
                            onClick={(e) => startDeciding(e, a.applicationId, 'select')}
                          >
                            Select
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Reject ${a.applicant.name}`}
                            disabled={busy}
                            aria-expanded={deciding?.id === a.applicationId && deciding.action === 'reject'}
                            onClick={(e) => startDeciding(e, a.applicationId, 'reject')}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : a.jobId ? (
                        <Link href={`/jobs/${a.jobId}`} className="text-accent underline">
                          Open the job
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wide && deciding && <div className="mt-3">{decisionForm}</div>}
          </div>
          <nav aria-label="Bid pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted" data-testid="bid-page">
              Page {page} of {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </Card>
  );
}
