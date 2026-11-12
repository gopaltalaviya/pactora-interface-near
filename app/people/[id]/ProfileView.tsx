'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText, useNetwork} from '@/components/market/hooks';
import {CredentialList} from '@/components/market/CredentialList';
import {Button} from '@/components/ui/Button';
import {utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Skeleton} from '@/components/ui/States';
import {ReportButton} from '@/components/market/Report';
import {RecordOverTime} from '@/components/market/RecordOverTime';
import {ApiError, api} from '@/lib/api';
import {agentHref, manageHref} from '@/lib/links';
import {displayAccount} from '@/lib/near';
import {authorText, profiles, ratingText, starsOf, type ProfileDetail} from '@/lib/profiles';

/** One published profile: what its owner chose to show, and what the other side of their jobs wrote. */
export function ProfileView({profileId}: {profileId: string}) {
  const [p, setP] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState<{text: string; missing: boolean} | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An agent's profile names its CONTRACT id; its marketplace page is keyed by the API's id.
  const [marketId, setMarketId] = useState<number | null>(null);
  // That agent's own account, which holds its work credentials.
  const [marketWallet, setMarketWallet] = useState<string | null>(null);
  const network = useNetwork()?.network ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    profiles
      .get(profileId, controller.signal)
      .then(setP)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError({text: errorText(err), missing: err instanceof ApiError && err.code === 'NOT_FOUND'});
      });
    return () => controller.abort();
  }, [profileId, attempt]);

  const chainAgentId = p?.kind === 'agent' ? p.chainAgentId : null;
  useEffect(() => {
    if (!chainAgentId) return;
    const controller = new AbortController();
    api
      .agents({limit: 100}, controller.signal)
      .then((list) => {
        const found = list.find((a) => String(a.chainAgentId ?? '') === chainAgentId);
        if (found) {
          setMarketId(found.agentId);
          setMarketWallet(found.walletAddress);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [chainAgentId]);

  const back = {href: '/people', label: 'Directory'};
  if (error && !p) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={error.missing ? 'Profile not found' : 'Could not load this profile'} />
        {error.missing ? (
          <ErrorState title="This profile is not published, or does not exist">{error.text}</ErrorState>
        ) : (
          <ErrorState
            title="The profile could not be loaded"
            action={
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            }
          >
            {error.text}
          </ErrorState>
        )}
      </div>
    );
  }
  if (!p) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Profile" />
        <div role="status" aria-label="Loading the profile">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow={p.kind === 'person' ? 'Person' : 'Agent'}
        title={p.displayName}
        description={p.headline || undefined}
        actions={
          <>
            <Badge tone={p.kind === 'person' ? 'live' : 'chain'}>
              {p.kind === 'person' ? 'Person' : 'Agent'}
            </Badge>
            {p.availability && <Badge tone="settled">Open to work</Badge>}
            {p.hireable === false && <Badge tone="refused">Not hireable yet</Badge>}
          </>
        }
      />
      <Card title="About" labelledBy="about">
        <div className="space-y-3 text-sm">
          <p data-testid="profile-rating">
            <span aria-hidden className="mr-1 text-accent">
              {p.rating.count > 0 && p.rating.average !== null ? starsOf(p.rating.average) : ''}
            </span>
            {ratingText(p.rating)} · {p.settledJobs} settled job{p.settledJobs === 1 ? '' : 's'}
          </p>
          {/* Written by its owner: shown as text. */}
          {p.bio && <p className="whitespace-pre-wrap break-words">{p.bio}</p>}
          {p.account && (
            <p>
              Account:{' '}
              <span className="tabular" data-testid="profile-account">
                {displayAccount(p.account)}
              </span>
            </p>
          )}
          {p.location && <p>Location: {p.location}</p>}
          {(p.skills?.length || p.capabilities.length) > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
              {[...new Set([...(p.skills ?? []), ...p.capabilities])].map((c) => (
                <li key={c}>
                  <Tag>{c}</Tag>
                </li>
              ))}
            </ul>
          )}
          {p.hireable === false && (
            <p className="text-xs text-muted">
              Not hireable yet: the stake is below the network minimum, so a client cannot select this person.
            </p>
          )}
          {p.taskList && (
            <div data-testid="task-list">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Task list</h3>
              <p className="mt-1 text-xs text-muted">
                {p.taskList.jobs.open} open job{p.taskList.jobs.open === 1 ? '' : 's'},{' '}
                {p.taskList.jobs.settled} settled.
              </p>
              {p.taskList.listings.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {p.taskList.listings.map((l) => (
                    <li key={l.listingId}>
                      <Link
                        href={`/jobs/listing/${encodeURIComponent(l.listingId)}`}
                        className="text-accent underline"
                      >
                        {l.title}
                      </Link>{' '}
                      <span className="text-xs text-muted">({l.status})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="pt-2">
            <ReportButton targetType="person" targetId={p.profileId} what="this profile" />
          </div>
          {p.kind === 'agent' && p.chainAgentId && (
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {marketId !== null && (
                <Link href={agentHref(marketId)} className="text-accent underline">
                  Its marketplace page
                </Link>
              )}
              <Link href={manageHref(p.chainAgentId)} className="text-accent underline">
                Its on-chain record (#{p.chainAgentId})
              </Link>
            </p>
          )}
        </div>
      </Card>
      <RecordOverTime subject={{profileId: p.profileId}} />
      {/* Work credentials, on a network that issues them: a person's are held by the account it
          shows; an agent's by its own account (feature/work-credentials). */}
      {network?.contracts.Credentials && (p.account ?? marketWallet) && (
        <CredentialList owner={(p.account ?? marketWallet)!} network={network} />
      )}
      <Card
        title="Reviews"
        labelledBy="reviews"
        description="From the other side of settled jobs. Each is shown once both sides have reviewed, or 14 days after the job settled."
      >
        {p.reviews.length === 0 ? (
          <p className="text-sm text-muted">No reviews shown yet.</p>
        ) : (
          <ol aria-label="Reviews" className="space-y-3">
            {p.reviews.map((r) => (
              <li key={r.reviewId} className="rounded-lg border border-edge p-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span aria-hidden className="mr-1 text-accent">
                      {starsOf(r.rating)}
                    </span>
                    <span className="sr-only">{r.rating} out of 5</span>
                    <span className="font-medium">{authorText(r)}</span>
                    <span className="text-muted"> · as the {r.authorRole}</span>
                  </span>
                  <span className="text-xs text-muted">{utc(r.at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{r.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
