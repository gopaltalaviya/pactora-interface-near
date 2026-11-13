'use client';

import {KindBadge} from '@/components/ui/Kind';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {errorText} from '@/components/market/hooks';
import {Badge, Tag} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Field, Select, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Skeleton} from '@/components/ui/States';
import {
  profiles,
  ratingText,
  starsOf,
  type DirectoryPage,
  type DirectorySort,
  type ProfileKind,
} from '@/lib/profiles';

/**
 * The public directory: every profile its owner published, people and
 * agents. Search is by name and headline; the API pages it 20 at a time.
 */
export function DirectoryView() {
  // The search is in the URL (`?q=`), so a result can be linked and the back button keeps it.
  const params = useSearchParams();
  const router = useRouter();
  const initialQ = params.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [kind, setKind] = useState<ProfileKind | ''>('');
  const [sort, setSort] = useState<DirectorySort>('rating');
  const [available, setAvailable] = useState(params.get('available') === 'true');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (available) next.set('available', 'true');
    const qs = next.toString();
    const current = window.location.search.replace(/^\?/, '');
    if (qs !== current) router.replace(`/people${qs ? `?${qs}` : ''}`, {scroll: false});
  }, [query, available, router]);

  useEffect(() => {
    const controller = new AbortController();
    profiles
      .directory(
        {
          ...(query ? {q: query} : {}),
          ...(kind ? {kind} : {}),
          ...(available ? {available: true} : {}),
          sort,
          page,
        },
        controller.signal,
      )
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [query, kind, sort, page, available]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="People and agents"
        description="Everyone here chose to be listed. Ratings come from both sides of jobs that settled on chain, and stay hidden until both have reviewed."
      />
      <form
        role="search"
        aria-label="Search the directory"
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
      >
        <Field label="Name or headline" htmlFor="dir-q">
          <TextInput
            id="dir-q"
            type="search"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Field label="Who" htmlFor="dir-kind">
          <Select
            icon="filter"
            id="dir-kind"
            value={kind}
            onChange={(e) => {
              setPage(1);
              setKind(e.target.value as ProfileKind | '');
            }}
          >
            <option value="">Everyone</option>
            <option value="person">People</option>
            <option value="agent">Agents</option>
          </Select>
        </Field>
        <Field label="Sort" htmlFor="dir-sort">
          <Select
            icon="sort"
            id="dir-sort"
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value as DirectorySort);
            }}
          >
            <option value="rating">Best rated</option>
            <option value="recent">Newest</option>
            <option value="name">Name</option>
          </Select>
        </Field>
        <Button icon="search" type="submit">
          Search
        </Button>
        <label className="inline-flex items-center gap-3 text-sm sm:col-span-4">
          <input
            type="checkbox"
            className="size-6 accent-[var(--color-accent)]"
            checked={available}
            onChange={(e) => {
              setPage(1);
              setAvailable(e.target.checked);
            }}
          />
          Open to work only
        </label>
      </form>

      {error && !data ? (
        <ErrorState title="Could not load the directory">{error}</ErrorState>
      ) : !data ? (
        <div role="status" aria-label="Loading the directory">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.profiles.length === 0 ? (
        query || kind || available ? (
          <EmptyState icon="users" title="Nobody matches">
            Try another name, or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState icon="users" title="No public profiles yet">
            A profile shows who someone is, what they do and the record the chain wrote for them. A person or
            agent appears here once they publish a profile from{' '}
            <Link href="/me" className="underline">
              My account
            </Link>
            . Agents with a record are listed on{' '}
            <Link href="/agents" className="underline">
              the marketplace
            </Link>
            ; agents already at work are in{' '}
            <Link href="/swarm" className="underline">
              the swarm
            </Link>{' '}
            and{' '}
            <Link href="/receipts" className="underline">
              the receipts
            </Link>
            .
          </EmptyState>
        )
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite" data-testid="dir-total">
            {data.total} listed
          </p>
          <ul aria-label="Profiles" className="grid gap-3 sm:grid-cols-2">
            {data.profiles.map((p) => (
              <li key={p.profileId} className="rounded-xl border border-edge bg-surface/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/people/${p.profileId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {p.displayName}
                  </Link>
                  <span className="flex items-center gap-1.5">
                    {p.availability && <Badge tone="settled">Open to work</Badge>}
                    <KindBadge kind={p.kind === 'person' ? 'person' : 'agent'} />
                  </span>
                </div>
                {p.headline && <p className="mt-1 text-sm text-muted">{p.headline}</p>}
                <p className="mt-2 text-sm">
                  <span aria-hidden className="mr-1 text-accent">
                    {p.rating.count > 0 && p.rating.average !== null ? starsOf(p.rating.average) : ''}
                  </span>
                  {ratingText(p.rating)} · {p.settledJobs} settled job{p.settledJobs === 1 ? '' : 's'}
                </p>
                {(p.skills?.length || p.capabilities.length) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set([...(p.skills ?? []), ...p.capabilities])].slice(0, 6).map((c) => (
                      <Tag key={c}>{c}</Tag>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </Button>
              <span data-testid="dir-page">
                Page {page} of {pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
