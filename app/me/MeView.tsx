'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import {errorText, SignInGate, useMe, useNetwork, type TokenInfo} from '@/components/market/hooks';
import {ListingCard, utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card, Stat} from '@/components/ui/Card';
import {Select} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {
  amountDisplay,
  jobStateWords,
  jobTone,
  market,
  type JobRow,
  type Listing,
  type ListingStatus,
} from '@/lib/market';
import {displayAccount} from '@/lib/near';
import {notifications, type FaucetClaim, type FaucetStatus} from '@/lib/notifications';
import {safeHref} from '@/lib/links';
import {ProfileEditor} from '@/components/market/Profile';
import {IdentityCard} from '@/components/market/Identity';
import {ChannelsCard} from '@/components/market/Channels';
import {useSession} from '@/lib/session';

/**
 * One signed-in person's page: who they are to Pactora, what they have earned
 * and spent, the listings they posted and the jobs they are on.
 */
export function MeView() {
  const session = useSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="My account"
        description="What Pactora knows about your account: your person record, what settled jobs have paid you, your listings and your jobs."
        actions={
          <>
            <ButtonLink href="/jobs/new" size="sm">
              Post a listing
            </ButtonLink>
            <ButtonLink href="/jobs" size="sm">
              Browse jobs
            </ButtonLink>
          </>
        }
      />
      <SignInGate what="see your account">{session.status === 'in' && <Signed />}</SignInGate>
    </div>
  );
}

function Signed() {
  const token = useNetwork();
  const {me, error, reload} = useMe();

  if (error && !me) {
    return (
      <ErrorState
        title="Could not load your account"
        action={
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        }
      >
        {error}
      </ErrorState>
    );
  }
  if (!me) {
    return (
      <div role="status" aria-label="Loading your account" className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const units = (base: string) =>
    token ? amountDisplay(base, token.decimals, token.symbol) : `${base} base units`;

  return (
    <div className="space-y-6">
      <Card title="Overview" labelledBy="overview">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Account</dt>
            <dd className="tabular break-all" data-testid="me-account">
              {displayAccount(me.account)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Person record</dt>
            <dd data-testid="me-person">{me.person ? me.person.name : 'None yet'}</dd>
          </div>
          {me.person?.location && (
            <div>
              <dt className="text-muted">Location</dt>
              <dd>{me.person.location}</dd>
            </div>
          )}
          {me.person && me.person.capabilities.length > 0 && (
            <div>
              <dt className="text-muted">Skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {me.person.capabilities.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </dd>
            </div>
          )}
        </dl>
        {me.person ? (
          <p className="mt-4 text-sm">
            <Link href={`/agents/${me.person.chainAgentId}/manage`} className="text-accent underline">
              Fund and stake
            </Link>
          </p>
        ) : (
          <div className="mt-4">
            <Notice>
              You have no person record yet, so there is nothing to show below.{' '}
              <Link href="/join" className="underline">
                Join as a person
              </Link>
              .
            </Notice>
          </div>
        )}
      </Card>

      <FaucetCard units={units} />

      {me.person && <ProfileEditor />}

      {me.person && <IdentityCard />}

      {me.person && <ChannelsCard />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Earned from settled jobs"
          value={<span data-testid="me-earned">{units(me.earnings.receivedBaseUnits)}</span>}
          hint="After the fee. Settled jobs only: this is not a wallet balance."
        />
        <Stat
          label="Settled jobs as a worker"
          value={<span data-testid="me-settled">{me.earnings.settledCount}</span>}
        />
        <Stat
          label="Spent on settled jobs"
          value={<span data-testid="me-spent">{units(me.spentBaseUnits)}</span>}
          hint="As a client. Not a wallet balance either."
        />
      </div>

      {me.person && (
        <>
          <MyListings token={token} />
          <MyJobs />
        </>
      )}
    </div>
  );
}

function MyListings({token}: {token: TokenInfo | null}) {
  const {authed} = useSession();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<ListingStatus>('open');

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    authed((t) => market.listings({mine: true, status, limit: 12}, t))
      .then((p) => {
        if (!live) return;
        setRows(p.listings);
        setNext(p.nextCursor);
      })
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [authed, status]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setMore(true);
    try {
      const p = await authed((t) => market.listings({mine: true, status, limit: 12, cursor: next}, t));
      setRows((prev) => [...(prev ?? []), ...p.listings]);
      setNext(p.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMore(false);
    }
  }, [authed, next, status]);

  return (
    <Card
      title="My listings"
      labelledBy="my-listings"
      description="Listings you posted."
      actions={
        <div className="w-36">
          <Select
            aria-label="Listing status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ListingStatus)}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="filled">Filled</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      }
    >
      {error && <ErrorState title="Could not load your listings">{error}</ErrorState>}
      {!rows && !error && <Skeleton className="h-24 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState
          icon="search"
          title={`You have no ${status} listings`}
          action={
            <ButtonLink href="/jobs/new" size="sm">
              Post a listing
            </ButtonLink>
          }
        />
      )}
      {rows && rows.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2" aria-label="My listings">
            {rows.map((l) => (
              <li key={l.listingId}>
                <ListingCard listing={l} token={token} />
              </li>
            ))}
          </ul>
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={more} onClick={() => void loadMore()}>
                Load more listings
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function MyJobs() {
  const {authed} = useSession();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    authed((t) => market.jobs(t, {limit: 20}))
      .then((p) => {
        if (!live) return;
        setRows(p.jobs);
        setNext(p.nextCursor);
      })
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [authed]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const p = await authed((t) => market.jobs(t, {limit: 20, cursor: next}));
      setRows((prev) => [...(prev ?? []), ...p.jobs]);
      setNext(p.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMore(false);
    }
  }

  return (
    <Card title="My jobs" labelledBy="my-jobs" description="Jobs where you are the client or the worker.">
      {error && <ErrorState title="Could not load your jobs">{error}</ErrorState>}
      {!rows && !error && <Skeleton className="h-24 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState icon="coins" title="No jobs yet">
          A job appears here when you select a bid, or when a client selects yours.
        </EmptyState>
      )}
      {rows && rows.length > 0 && (
        <>
          <ul className="divide-y divide-edge" aria-label="My jobs">
            {rows.map((j) => {
              const words = jobStateWords({state: j.state, chainJobId: j.chainJobId, declined: null});
              return (
                <li
                  key={j.jobId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  data-testid="my-job"
                >
                  <div className="min-w-0">
                    <Link href={`/jobs/${j.jobId}`} className="font-medium text-accent underline">
                      {typeof j.spec?.capability === 'string' ? j.spec.capability : 'Job'}
                    </Link>
                    <p className="text-xs text-muted">
                      {j.amountDisplay} · you are the {j.role} · {utc(j.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {j.resultMismatch && <Badge tone="broken">Result mismatch</Badge>}
                    <Badge tone={jobTone(j.state)}>{words.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={more} onClick={() => void loadMore()}>
                Load more jobs
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Test tokens to try Pactora with (docs/26 F23): testnet only, once a day,
 * from a faucet with a limited float. Not shown where there is no faucet.
 */
function FaucetCard({units}: {units: (base: string) => string}) {
  const {authed} = useSession();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [claim, setClaim] = useState<FaucetClaim | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => notifications.faucet(t, controller.signal))
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) setStatus(null);
      });
    return () => controller.abort();
  }, [authed]);

  if (!status || !status.testnet || !status.available) return null;

  async function take() {
    setBusy(true);
    setProblem(null);
    try {
      setClaim(await authed((t) => notifications.claim(t)));
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const href = claim ? safeHref(claim.explorerUrl) : null;
  const claimed = status.claimedToday || claim !== null;
  return (
    <Card
      title="Test tokens"
      labelledBy="faucet"
      description="Testnet only: tokens with no value, to try hiring, bidding and staking."
    >
      <div className="space-y-3 text-sm">
        <p>
          Claim {units(status.amount)} once a day (UTC), sent to your own account
          {claim?.registered ? '; your account was registered with the token first' : ''}.
        </p>
        {claim ? (
          <p role="status" data-testid="faucet-sent">
            Sent {units(claim.amount)} from {claim.from}.{' '}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                View transaction
              </a>
            )}
          </p>
        ) : claimed ? (
          <p className="text-muted" data-testid="faucet-claimed">
            You have claimed today. Come back tomorrow.
          </p>
        ) : (
          <Button size="sm" disabled={busy} loading={busy} onClick={() => void take()}>
            Claim test tokens
          </Button>
        )}
        {problem && (
          <p role="alert" className="text-xs text-broken">
            {problem}
          </p>
        )}
      </div>
    </Card>
  );
}
