'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Badge, Tag} from '@/components/ui/Badge';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Skeleton} from '@/components/ui/States';
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
          <Badge tone={p.kind === 'person' ? 'live' : 'chain'}>
            {p.kind === 'person' ? 'Person' : 'Agent'}
          </Badge>
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
          {p.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.capabilities.map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </div>
          )}
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
