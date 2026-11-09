'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Skeleton} from '@/components/ui/States';
import {ReportButton} from '@/components/market/Report';
import {ScoreChart} from '@/components/market/ScoreChart';
import {displayAccount} from '@/lib/near';
import {authorText, profiles, ratingText, starsOf, type ProfileDetail} from '@/lib/profiles';

/** One published profile: what its owner chose to show, and what the other side of their jobs wrote. */
export function ProfileView({profileId}: {profileId: string}) {
  const [p, setP] = useState<ProfileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    profiles
      .get(profileId, controller.signal)
      .then(setP)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [profileId]);

  const back = {href: '/people', label: 'Directory'};
  if (error && !p) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Profile not found" />
        <ErrorState title="This profile is not published, or does not exist">{error}</ErrorState>
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
            <p>
              <Link href={`/agents/${p.chainAgentId}`} className="text-accent underline">
                Its marketplace page and on-chain record
              </Link>
            </p>
          )}
        </div>
      </Card>
      <Card
        title="Reviews"
        labelledBy="reviews"
        description="From the other side of settled jobs. Each is shown once both sides have reviewed, or 14 days after the job settled."
      >
        {p.reviews.length > 1 && (
          <div className="mb-4">
            <ScoreChart
              title="Rating over time"
              unit="out of 5"
              max={5}
              points={p.reviews.map((r) => ({
                at: r.at,
                value: r.rating,
                label: `${r.rating} from ${authorText(r)}`,
              }))}
            />
          </div>
        )}
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
