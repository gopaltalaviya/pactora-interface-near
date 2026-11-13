'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {errorText, SignInGate, useMe, useNetwork} from '@/components/market/hooks';
import {ListingCard, utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {AgentHealthBadges, useAgentHealth} from '@/components/market/AgentHealth';
import {KindIcon} from '@/components/ui/Kind';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card, Stat} from '@/components/ui/Card';
import {Select} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {account as accountApi, OpenJobsError, scrubbedWords, type MyApplication} from '@/lib/account';
import {
  amountDisplay,
  JOB_STATE_WORDS,
  jobStateWords,
  jobTitle,
  jobTone,
  market,
  type JobRow,
  type JobState,
  type Listing,
  type ListingStatus,
  type MyAgent,
} from '@/lib/market';
import {displayAccount} from '@/lib/near';
import {notifications, type FaucetClaim, type FaucetStatus} from '@/lib/notifications';
import {agentHref, manageHref, safeHref} from '@/lib/links';
import {ProfileEditor} from '@/components/market/Profile';
import {IdentityCard} from '@/components/market/Identity';
import {ChannelsCard} from '@/components/market/Channels';
import {StandingBanner} from '@/components/market/Standing';
import {MoneyPanel, useMoney} from '@/components/money/MoneyPanel';
import {useLandOn} from '@/components/ui/useLandOn';
import {nearFaucetOf} from '@/lib/balances';
import {describeError} from '@/lib/errors';
import {useSession} from '@/lib/session';
import {termsAcceptedAt, TERMS_VERSION} from '@/lib/terms';

/**
 * One signed-in person's page, in five tabs (docs/27 §4: one long page was
 * too long on a phone): who they are to Pactora and what settled jobs paid
 * them; their public profile; their jobs and bids; their listings; and the
 * settings — identity check, channels, sessions, their data. The tab is in
 * the URL's hash, so a link can point at one.
 *
 * The loads run side by side: the jobs, bids and listings need only the
 * session (its person record says whether there is anything to ask for),
 * so they are not held behind GET /v1/me.
 */

type Tab = 'overview' | 'profile' | 'jobs' | 'listings' | 'settings';
const TABS: {id: Tab; label: string}[] = [
  {id: 'overview', label: 'Overview'},
  {id: 'profile', label: 'Profile'},
  {id: 'jobs', label: 'Jobs'},
  {id: 'listings', label: 'Listings'},
  {id: 'settings', label: 'Settings'},
];
const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, '');
      setTab(isTab(h) ? h : 'overview');
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const pick = useCallback((t: Tab) => {
    setTab(t);
    const url = `${window.location.pathname}${window.location.search}#${t}`;
    window.history.replaceState(window.history.state, '', url);
  }, []);
  return [tab, pick];
}

export function MeView() {
  const session = useSession();
  // The API revokes the session that deleted the account; the result stays on screen regardless.
  const [deleted, setDeleted] = useState<string | null>(null);
  if (deleted) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Account" title="Account deleted" />
        <Card title="Your data" labelledBy="your-data">
          <p role="status" className="text-sm" data-testid="account-deleted">
            {deleted} What stays: the job rows and their on-chain events, ratings without their text, and the
            compliance audit. Nothing on the blockchain can be deleted, by anyone.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/" className="text-accent underline">
              Back to the start
            </Link>
          </p>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="My account"
        description="What Pactora knows about your account: your person record, what settled jobs have paid you, your listings, your jobs and bids, and your settings."
        actions={
          <>
            {/* Posting needs a person record: offered only to someone who has one. */}
            {session.status === 'in' && session.person && (
              <ButtonLink icon="plus" href="/jobs/new" size="sm">
                Post a listing
              </ButtonLink>
            )}
            <ButtonLink icon="list" href="/jobs" size="sm">
              Browse jobs
            </ButtonLink>
          </>
        }
      />
      <SignInGate what="see your account">
        {session.status === 'in' && <Signed onDeleted={setDeleted} />}
      </SignInGate>
    </div>
  );
}

function Signed({onDeleted}: {onDeleted: (what: string) => void}) {
  const {person} = useSession();
  const [tab, pick] = useTab();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs, as a tablist is expected to.
  function onKey(e: React.KeyboardEvent, i: number) {
    const n = TABS.length;
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    pick(TABS[to]!.id);
    tabRefs.current[to]?.focus();
  }

  return (
    <div className="space-y-6">
      <StandingBanner />
      <div role="tablist" aria-label="Account sections" className="flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={tab === t.id ? `panel-${t.id}` : undefined}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`min-h-9 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              tab === t.id ? 'border-accent bg-accent/10 text-text' : 'border-edge text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-6">
        {tab === 'overview' && (
          <>
            <Overview />
            <MyMoney />
            {/* Any signed-in account may claim (routes/faucet.ts), person record or not. */}
            <FaucetCard />
            <MyAgents />
          </>
        )}
        {tab === 'profile' &&
          (person ? <ProfileEditor /> : <JoinFirst what="A public profile needs a person record." />)}
        {tab === 'jobs' &&
          (person ? (
            <>
              <MyJobs />
              <MyBids />
            </>
          ) : (
            <JoinFirst what="Jobs and bids need a person record." />
          ))}
        {tab === 'listings' &&
          (person ? <MyListings /> : <JoinFirst what="Posting needs a person record." />)}
        {tab === 'settings' && (
          <>
            {person && <IdentityCard />}
            {person && <ChannelsCard />}
            <SessionsCard />
            {person && <YourDataCard onDeleted={onDeleted} />}
          </>
        )}
      </div>
    </div>
  );
}

function JoinFirst({what}: {what: string}) {
  const {personError} = useSession();
  // The record is unknown (the API failed), not missing: the session banner says so.
  if (personError) return null;
  return (
    <Notice>
      {what}{' '}
      <Link href="/join" className="underline">
        Join as a person
      </Link>
      .
    </Notice>
  );
}

function Overview() {
  const token = useNetwork();
  const {account, authed} = useSession();
  const {me, error, reload} = useMe();
  // An acceptance this browser holds but the account does not (accounts that joined
  // before 2026-11-13): recorded on the account once, then read back from the API.
  const backfill =
    me?.person && me.person.terms && !me.person.terms.acceptedAt && account ? termsAcceptedAt(account) : null;
  useEffect(() => {
    if (!backfill) return;
    let live = true;
    void authed((t) => market.acceptTerms(t, TERMS_VERSION))
      .then(() => {
        if (live) reload();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [backfill, authed, reload]);
  const units = (base: string) =>
    token ? amountDisplay(base, token.decimals, token.symbol) : `${base} base units`;

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
  // On the account when the API holds it; else this browser's record (older accounts).
  const onAccount = me.person?.terms?.acceptedAt ?? null;
  const accepted = onAccount ?? (account ? termsAcceptedAt(account) : null);
  return (
    <>
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
          {accepted && (
            <div>
              <dt className="text-muted">Terms accepted</dt>
              <dd data-testid="terms-accepted">
                {utc(accepted)} ({onAccount ? 'recorded on your account' : 'recorded by this browser'})
              </dd>
            </div>
          )}
        </dl>
        {me.person ? (
          <p className="mt-4 text-sm">
            <Link href={manageHref(me.person.chainAgentId)} className="text-accent underline">
              Fund and stake
            </Link>
            <span className="text-muted">
              {' '}
              · your record&apos;s purse and stake (on-chain #{me.person.chainAgentId})
            </span>
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
    </>
  );
}

/**
 * The agents this account owns (GET /v1/me/agents), each with its profile
 * (the API's id) and its manage page (the contract's id). The person record
 * is shown above, so it is left out here.
 */
/** Paused, not hireable, or low on storage: read from the chain (live test, 2026-11-13). */
function MyAgentHealth({active, chainAgentId}: {active: boolean; chainAgentId: string | null}) {
  const network = useNetwork()?.network ?? null;
  return <AgentHealthBadges active={active} health={useAgentHealth(chainAgentId, network)} />;
}

function MyAgents() {
  const {authed} = useSession();
  const [rows, setRows] = useState<MyAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError(null);
    authed((t) => market.myAgents(t, c.signal))
      .then((r) => setRows(r.agents.filter((a) => a.kind === 'agent')))
      .catch((err: unknown) => {
        if (!c.signal.aborted) setError(errorText(err));
      });
    return () => c.abort();
  }, [authed, attempt]);

  if (error && !rows)
    return (
      <ErrorState
        title="Could not load your agents"
        action={
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        }
      >
        {error}
      </ErrorState>
    );
  if (!rows || rows.length === 0) return null;
  return (
    <Card
      title="My agents"
      labelledBy="my-agents"
      description="Agents registered by this account. Manage is where you fund, stake and set caps, and handle the API key."
    >
      <ul className="divide-y divide-edge text-sm">
        {rows.map((a) => (
          <li key={a.agentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-wrap items-center gap-2">
              <KindIcon kind="agent" />
              <Link href={agentHref(a.agentId)} className="font-medium text-accent underline">
                {a.name}
              </Link>
              <MyAgentHealth
                active={a.active}
                chainAgentId={a.chainAgentId ? String(a.chainAgentId) : null}
              />
            </span>
            {a.chainAgentId ? (
              <Link
                href={manageHref(a.chainAgentId)}
                aria-label={`Manage ${a.name}`}
                className="text-accent underline"
              >
                Manage
              </Link>
            ) : (
              <span className="text-xs text-muted">not registered on chain yet</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        <Link href="/register" className="underline">
          Register another agent
        </Link>
      </p>
    </Card>
  );
}

function MyListings() {
  const token = useNetwork();
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
            <ButtonLink icon="plus" href="/jobs/new" size="sm">
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

/** The job status filter, kept in the URL (`?status=open`) so a link can carry it. */
type JobFilter = '' | 'open' | 'closed' | JobState;
const JOB_FILTERS: {value: JobFilter; label: string}[] = [
  {value: '', label: 'All'},
  {value: 'open', label: 'Open (offered, in progress, delivered, disputed)'},
  {value: 'closed', label: 'Closed (settled, refunded)'},
  ...(Object.keys(JOB_STATE_WORDS) as JobState[]).map((s) => ({value: s, label: JOB_STATE_WORDS[s].label})),
];
const isJobFilter = (v: string): v is JobFilter => JOB_FILTERS.some((f) => f.value === v);

function MyJobs() {
  const {authed} = useSession();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState<JobFilter>(() => {
    if (typeof window === 'undefined') return '';
    const v = new URLSearchParams(window.location.search).get('status') ?? '';
    return isJobFilter(v) ? v : '';
  });

  const pickStatus = (v: JobFilter) => {
    setStatus(v);
    const params = new URLSearchParams(window.location.search);
    if (v) params.set('status', v);
    else params.delete('status');
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  };

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    authed((t) => market.jobs(t, {limit: 20, ...(status ? {status} : {})}))
      .then((p) => {
        if (!live) return;
        setRows(p.jobs);
        setNext(p.nextCursor);
      })
      .catch((err: unknown) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [authed, status]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const p = await authed((t) => market.jobs(t, {limit: 20, cursor: next, ...(status ? {status} : {})}));
      setRows((prev) => [...(prev ?? []), ...p.jobs]);
      setNext(p.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMore(false);
    }
  }

  return (
    <Card
      title="My jobs"
      labelledBy="my-jobs"
      description="Jobs where you are the client or the worker."
      actions={
        <div className="w-44">
          <Select
            aria-label="Job status"
            value={status}
            onChange={(e) => pickStatus(isJobFilter(e.target.value) ? e.target.value : '')}
          >
            {JOB_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      {error && <ErrorState title="Could not load your jobs">{error}</ErrorState>}
      {!rows && !error && <Skeleton className="h-24 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState icon="coins" title={status ? 'No jobs match this filter' : 'No jobs yet'}>
          {status
            ? 'Choose another status, or all of them.'
            : 'A job appears here when you select a bid, or when a client selects yours.'}
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
                      {jobTitle(j)}
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

/** The bids this person made, newest first, each with the listing it is on (GET /v1/me/applications). */
function MyBids() {
  const {authed} = useSession();
  const [rows, setRows] = useState<MyApplication[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => accountApi.applications(t, {limit: 20}, controller.signal))
      .then((p) => {
        setRows(p.applications);
        setNext(p.nextCursor);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [authed]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const p = await authed((t) => accountApi.applications(t, {limit: 20, cursor: next}));
      setRows((prev) => [...(prev ?? []), ...p.applications]);
      setNext(p.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMore(false);
    }
  }

  const tone = (s: string) =>
    s === 'selected' ? 'settled' : s === 'pending' ? 'live' : s === 'rejected' ? 'refused' : 'neutral';

  return (
    <Card title="My bids" labelledBy="my-bids" description="Bids you made on listings, newest first.">
      {error && <ErrorState title="Could not load your bids">{error}</ErrorState>}
      {!rows && !error && <Skeleton className="h-24 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState icon="search" title="No bids yet">
          Bid on a listing from the{' '}
          <Link href="/jobs" className="underline">
            board
          </Link>
          .
        </EmptyState>
      )}
      {rows && rows.length > 0 && (
        <>
          <ul className="divide-y divide-edge" aria-label="My bids">
            {rows.map((a) => (
              <li
                key={a.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                data-testid="my-bid-row"
              >
                <div className="min-w-0">
                  <Link
                    href={`/jobs/listing/${encodeURIComponent(a.listing.listingId)}`}
                    className="font-medium text-accent underline"
                  >
                    {a.listing.title}
                  </Link>
                  <p className="text-xs text-muted">
                    Your price {a.priceDisplay} · by {a.listing.client.name} · {utc(a.createdAt)}
                  </p>
                  {a.reason && <p className="mt-1 text-xs text-muted">{a.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {a.jobId && (
                    <Link href={`/jobs/${a.jobId}`} className="text-xs text-accent underline">
                      Open the job
                    </Link>
                  )}
                  <Badge tone={tone(a.status)}>{a.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {next && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={more} onClick={() => void loadMore()}>
                Load more bids
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** This tab's session, and the way to end every session of the account (also on /signin). */
function SessionsCard() {
  const {account, expiresAt, signOutEverywhere} = useSession();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function everywhere() {
    setBusy(true);
    setProblem(null);
    try {
      await signOutEverywhere();
    } catch (err) {
      setProblem(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Card
      title="Sessions"
      labelledBy="sessions"
      description="A session is this tab's bearer token, kept until the tab closes or you sign out; it lasts 7 days at most."
    >
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Signed in as</dt>
          <dd className="tabular break-all">{account ? displayAccount(account) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Session ends</dt>
          <dd className="tabular">{expiresAt ? utc(expiresAt) : '—'}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        The API also ends every session when the account&apos;s keys change on chain, or when its agent
        rotates or revokes an API key.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!confirm ? (
          <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
            Sign out everywhere
          </Button>
        ) : (
          <>
            <span className="text-sm text-muted">Ends every session of this account, on every device.</span>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              disabled={busy}
              onClick={() => void everywhere()}
            >
              Yes, sign out everywhere
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
              Not now
            </Button>
          </>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-xs text-broken">
          {problem}
        </p>
      )}
    </Card>
  );
}

/** GDPR: the export, and the two-step deletion with the API's refusal shown in full. */
function YourDataCard({onDeleted}: {onDeleted: (what: string) => void}) {
  const {authed} = useSession();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [openJobs, setOpenJobs] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function exportData() {
    setBusy('export');
    setProblem(null);
    try {
      const {blob, filename} = await authed((t) => accountApi.export(t));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy('delete');
    setProblem(null);
    setOpenJobs(null);
    try {
      const {nonce} = await authed((t) => accountApi.deleteChallenge(t));
      const out = await authed((t) => accountApi.delete(t, nonce));
      onDeleted(`Your account is deleted. Removed: ${scrubbedWords(out.scrubbed)}.`);
    } catch (err) {
      if (err instanceof OpenJobsError) {
        setOpenJobs(err.openJobs);
        setProblem(
          `Not deleted: ${err.openJobs.length} open job${err.openJobs.length === 1 ? '' : 's'} first have to settle, be refunded or be cancelled.`,
        );
      } else setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Your data"
      labelledBy="your-data"
      description="Take a copy of everything Pactora holds about you, or delete your account. On-chain data cannot be deleted, by anyone."
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'export'}
            disabled={busy !== null}
            onClick={() => void exportData()}
          >
            Export my data
          </Button>
          <span className="text-xs text-muted">
            A JSON file: your record, profile, listings, bids, jobs, your own messages and drafts, your
            uploads, channels, sessions and feed. Never the other party&apos;s text.
          </span>
        </div>
        <div className="space-y-2 border-t border-edge pt-4">
          {!confirm ? (
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => setConfirm(true)}>
              Delete my account
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg border border-broken/40 p-3">
              <p>
                <strong>This cannot be undone.</strong> Your profile, messages, drafts, uploads, channels,
                sessions, API keys and webhooks are removed and your open listings cancelled; your name
                becomes &quot;deleted account&quot;. Job rows, ratings (without their text) and the compliance
                audit stay, and <strong>on-chain data cannot be deleted</strong>. The API refuses while any of
                your jobs is still open.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy === 'delete'}
                  disabled={busy !== null}
                  onClick={() => void deleteAccount()}
                >
                  Yes, delete my account
                </Button>
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm(false)}>
                  Keep my account
                </Button>
              </div>
            </div>
          )}
          {problem && (
            <div role="alert" className="text-xs text-broken">
              {problem}
              {openJobs && openJobs.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {openJobs.map((id) => (
                    <li key={id}>
                      <Link href={`/jobs/${id}`} className="underline">
                        Open job {id.slice(0, 8)}…
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted">
          Retention when you do nothing: evidence photos and chat 180 days after a job settles, drafts 90
          days, the job event log 365 days, read notifications 90 days. The{' '}
          <Link href="/privacy#how-long" className="underline">
            privacy policy
          </Link>{' '}
          has the full list.
        </p>
      </div>
    </Card>
  );
}

/** "Your money" (2026-11-12): the wallet, the person record's purse and stake, and the open jobs. */
function MyMoney() {
  const token = useNetwork();
  const {account, person} = useSession();
  const chainAgentId = person?.chainAgentId ?? null;
  const money = useMoney(token?.network ?? null, {account, chainAgentId, jobs: Boolean(person)});
  return (
    <MoneyPanel
      network={token?.network ?? null}
      money={money}
      account={account}
      chainAgentId={chainAgentId}
    />
  );
}

/**
 * Test tokens to try Pactora with (docs/26 F23): testnet only, once a day,
 * from a faucet with a limited float. Never silently missing (2026-11-12): a
 * server with no faucet, a read that failed, or a network that is not testnet
 * each get a card that says so and what to do instead; the NEAR faucet for
 * gas is linked too. Links to /me#faucet land on this card.
 */
function FaucetCard() {
  const {authed} = useSession();
  const token = useNetwork();
  const symbol = token?.symbol ?? 'tokens';
  const units = (base: string) =>
    token ? amountDisplay(base, token.decimals, token.symbol) : `${base} base units`;
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [claim, setClaim] = useState<FaucetClaim | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setReadError(null);
    authed((t) => notifications.faucet(t, controller.signal))
      .then(setStatus)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(null);
        setReadError(describeError(err, 'action').text);
      });
    return () => controller.abort();
  }, [authed, attempt]);

  // Arrived from a "test tokens" link: bring the card into view once it has something to say.
  const settled = status !== null || readError !== null;
  useLandOn('faucet', settled);

  const gas = token ? nearFaucetOf(token.network) : null;
  const gasLine = gas ? (
    <p className="text-xs text-muted" data-testid="near-faucet">
      Need NEAR for the network fee (gas)?{' '}
      <a href={gas} target="_blank" rel="noopener noreferrer" className="underline">
        NEAR testnet faucet
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  ) : null;

  if (!settled) {
    return (
      <Card title="Test tokens" labelledBy="faucet">
        <p role="status" className="text-sm text-muted">
          Checking the faucet…
        </p>
      </Card>
    );
  }

  const unavailable = !status
    ? 'unreadable'
    : !status.testnet
      ? 'mainnet'
      : !status.available
        ? 'none'
        : null;
  if (!status || unavailable) {
    return (
      <Card title={`Test ${symbol} faucet is not available on this server`} labelledBy="faucet">
        <div className="space-y-3 text-sm" data-testid="faucet-unavailable">
          <p role="status">
            {unavailable === 'unreadable'
              ? `Pactora could not say whether it has a faucet: ${readError ?? 'the request failed.'}`
              : unavailable === 'mainnet'
                ? 'This server runs on a network where tokens are real, and real tokens are never given away.'
                : `This server has no test-token faucet set up, so it cannot send you test ${symbol}.`}
          </p>
          <p className="text-muted">
            {unavailable === 'unreadable'
              ? 'Try again in a moment. '
              : unavailable === 'none'
                ? 'Ask whoever runs this server to set one up, or get test tokens from someone who has some. '
                : ''}
            Meanwhile you can still look around: jobs, agents and receipts need no tokens.
          </p>
          {unavailable === 'unreadable' && (
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          )}
          {unavailable !== 'mainnet' && gasLine}
        </div>
      </Card>
    );
  }

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
  const held = status.standing === 'hold' || status.standing === 'blocked';
  const whole = /^\d{1,39}$/;
  const dry =
    whole.test(status.remainingToday) &&
    whole.test(status.amount) &&
    BigInt(status.remainingToday) < BigInt(status.amount);
  return (
    <Card
      title="Test tokens"
      labelledBy="faucet"
      description={`Testnet only: ${symbol} with no value, to try hiring, bidding and staking.`}
    >
      <div className="space-y-3 text-sm">
        <p>
          Claim {units(status.amount)} once a day (UTC), sent to your own account
          {claim?.registered ? '; your account was registered with the token first' : ''}.
        </p>
        <p className="text-xs text-muted" data-testid="faucet-remaining">
          The faucet can give out {units(status.remainingToday)} more today, across everyone.
        </p>
        {claim ? (
          <p role="status" data-testid="faucet-sent">
            Sent {units(claim.amount)} from {claim.from}.{' '}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                View transaction
              </a>
            )}{' '}
            Next: move it into your purse or stake (Your money, above).
          </p>
        ) : claimed ? (
          <p className="text-muted" data-testid="faucet-claimed">
            You have claimed today. Come back after midnight UTC.
          </p>
        ) : held ? (
          <p className="text-refused" data-testid="faucet-standing">
            Your account is {status.standing === 'hold' ? 'on hold' : 'blocked'}, so the faucet will not send
            you tokens.{' '}
            <Link href="/me#settings" className="underline">
              Your identity check
            </Link>
            .
          </p>
        ) : dry ? (
          <p className="text-refused" data-testid="faucet-dry">
            The faucet has given out all it may today. Try again after midnight UTC.
          </p>
        ) : (
          <Button icon="coins" size="sm" disabled={busy} loading={busy} onClick={() => void take()}>
            Claim test tokens
          </Button>
        )}
        <div aria-live="polite">
          {problem && (
            <p role="alert" className="text-xs text-broken">
              {problem}
            </p>
          )}
        </div>
        {gasLine}
      </div>
    </Card>
  );
}
