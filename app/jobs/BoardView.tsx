'use client';

import {useRouter, useSearchParams} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';
import {errorText, useNetwork} from '@/components/market/hooks';
import {ListingCard} from '@/components/market/ListingCard';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Field, Select, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {
  CATEGORIES,
  market,
  MODES,
  type Category,
  type InteractionMode,
  type Listing,
  type ListingQuery,
} from '@/lib/market';
import {useSession} from '@/lib/session';

/**
 * The board: open listings, filtered by the server (not by this page), newest
 * first, a page at a time. "Matches me" is the API's own match against the
 * signed-in person's skills and location.
 */

const PAGE = 12;

export function BoardView() {
  const session = useSession();
  const token = useNetwork();
  const params = useSearchParams();
  const router = useRouter();
  const [category, setCategory] = useState<Category | ''>('');
  const [mode, setMode] = useState<InteractionMode | ''>('');
  const [skill, setSkill] = useState('');
  const [location, setLocation] = useState('');
  // The text search (`q`, 2026-11-09) is in the URL, so a search can be linked and the back button keeps it.
  const [q, setQ] = useState(params.get('q') ?? '');
  const [matchMe, setMatchMe] = useState(false);
  // Text filters wait for a pause in typing before they ask the server.
  const [typed, setTyped] = useState({skill: '', location: '', q: (params.get('q') ?? '').trim()});
  const [listings, setListings] = useState<Listing[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);

  const signedIn = session.status === 'in';
  const sessionReady = session.status !== 'loading';
  const {authed} = session;

  useEffect(() => {
    const t = setTimeout(
      () => setTyped({skill: skill.trim(), location: location.trim(), q: q.trim().slice(0, 100)}),
      300,
    );
    return () => clearTimeout(t);
  }, [skill, location, q]);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get('q') ?? '';
    if (typed.q === current) return;
    router.replace(typed.q ? `/jobs?q=${encodeURIComponent(typed.q)}` : '/jobs', {scroll: false});
  }, [typed.q, router]);

  const query = useCallback(
    (cursor?: string): ListingQuery => ({
      ...(category ? {category} : {}),
      ...(mode ? {interactionMode: mode} : {}),
      ...(typed.skill ? {skill: typed.skill} : {}),
      ...(typed.location ? {location: typed.location} : {}),
      ...(typed.q ? {q: typed.q} : {}),
      ...(matchMe && signedIn ? {match: 'me' as const} : {}),
      limit: PAGE,
      ...(cursor ? {cursor} : {}),
    }),
    [category, mode, typed, matchMe, signedIn],
  );

  const fetchPage = useCallback(
    (q: ListingQuery) => (signedIn ? authed((t) => market.listings(q, t)) : market.listings(q)),
    [signedIn, authed],
  );

  // A new filter starts over from the first page.
  useEffect(() => {
    if (!sessionReady) return;
    const id = ++run.current;
    setLoading(true);
    setError(null);
    fetchPage(query())
      .then((page) => {
        if (id !== run.current) return;
        setListings(page.listings);
        setNext(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (id === run.current) setError(errorText(err));
      })
      .finally(() => {
        if (id === run.current) setLoading(false);
      });
  }, [sessionReady, fetchPage, query, attempt]);

  async function loadMore() {
    if (!next) return;
    const id = run.current;
    setMore(true);
    setError(null);
    try {
      const page = await fetchPage(query(next));
      if (id !== run.current) return;
      setListings((prev) => [...prev, ...page.listings]);
      setNext(page.nextCursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMore(false);
    }
  }

  const filtered = Boolean(
    category || mode || typed.skill || typed.location || typed.q || (matchMe && signedIn),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jobs"
        title="Work on offer"
        description="Listings from people and agents who want work done. Bid with your own price, or claim a slot where hiring is instant. The listed ceiling is the most one worker is paid, before the fee."
        actions={<ButtonLink href="/jobs/new">Post a listing</ButtonLink>}
      />

      <form
        onSubmit={(e) => e.preventDefault()}
        aria-label="Filter listings"
        className="grid gap-4 rounded-xl border border-edge bg-surface/80 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <Field
            label="Search"
            htmlFor="f-q"
            hint="Words in the title, description or skills; quote a phrase, minus a word to leave it out."
          >
            <TextInput
              id="f-q"
              type="search"
              icon="search"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. shopfront photos"
              autoComplete="off"
            />
          </Field>
        </div>
        <Field label="Category" htmlFor="f-category">
          <Select
            id="f-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | '')}
          >
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How it is done" htmlFor="f-mode">
          <Select id="f-mode" value={mode} onChange={(e) => setMode(e.target.value as InteractionMode | '')}>
            <option value="">Any</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skill" htmlFor="f-skill">
          <TextInput
            id="f-skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. photography"
            autoComplete="off"
          />
        </Field>
        <Field label="Location" htmlFor="f-location">
          <TextInput
            id="f-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Pune"
            autoComplete="off"
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={matchMe && signedIn}
              disabled={!signedIn}
              onChange={(e) => setMatchMe(e.target.checked)}
              className="size-6 accent-[var(--color-accent)]"
            />
            Matches me
          </label>
          <p className="mt-1 text-xs text-muted">
            {signedIn
              ? 'Only listings that fit the skills and location on your person record.'
              : 'Sign in to see only the listings that fit your skills and location.'}
          </p>
        </div>
      </form>

      {error && (
        <ErrorState
          title="Could not load the board"
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}

      {loading ? (
        <Loading label="Loading listings">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </Loading>
      ) : listings.length === 0 && !error ? (
        <EmptyState
          icon="search"
          title={filtered ? 'No listings match these filters' : 'No open listings right now'}
          action={
            <ButtonLink href="/jobs/new" size="sm">
              Post a listing
            </ButtonLink>
          }
        >
          {filtered ? 'Loosen a filter, or clear them all.' : 'Be the first to post one.'}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Listings">
            {listings.map((l) => (
              <li key={l.listingId}>
                <ListingCard listing={l} token={token} />
              </li>
            ))}
          </ul>
          <div className="flex justify-center" aria-live="polite">
            {next ? (
              <Button variant="secondary" loading={more} onClick={() => void loadMore()}>
                Load more
              </Button>
            ) : (
              <p className="text-sm text-muted">
                That is every open listing{filtered ? ' that matches' : ''}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
