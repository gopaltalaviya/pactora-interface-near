'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import {errorText, SignInGate} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Skeleton} from '@/components/ui/States';
import {
  groupNotifications,
  notificationHref,
  notificationText,
  notifications,
  refreshNotifications,
  type Notification,
} from '@/lib/notifications';
import {useSession} from '@/lib/session';

/**
 * A signed-in person's notifications, newest first, grouped by the job or
 * listing they are about and linking to it. Opening the page does not mark
 * them read; the person does, one at a time or all at once, so nothing is
 * missed by a glance. The API already leaves out the person's own actions
 * and the chain's echoes (2026-11-09).
 */
export function NotificationsView() {
  const session = useSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="What happened on your jobs and listings: offers, bids, drafts, reviews of drafts, messages, payments and matches."
      />
      <SignInGate what="see your notifications">{session.status === 'in' && <List />}</SignInGate>
    </div>
  );
}

function List() {
  const {authed} = useSession();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState(0);
  const [before, setBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => notifications.list(t, {limit: 20}, controller.signal))
      .then((p) => {
        setItems(p.notifications);
        setUnread(p.unread);
        setLatest(p.latest);
        setBefore(p.before);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [authed, attempt]);

  const older = useCallback(async () => {
    if (before === null) return;
    setBusy(true);
    try {
      const p = await authed((t) => notifications.list(t, {limit: 20, before}));
      setItems((xs) => [...(xs ?? []), ...p.notifications]);
      setBefore(p.before);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [authed, before]);

  const markAll = useCallback(async () => {
    setBusy(true);
    try {
      const r = await authed((t) => notifications.markRead(t, latest));
      setUnread(r.unread);
      setItems((xs) => xs?.map((x) => (x.seq <= r.readSeq ? {...x, read: true} : x)) ?? null);
      refreshNotifications();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [authed, latest]);

  const markOne = useCallback(
    async (seq: number) => {
      try {
        await authed((t) => notifications.markOne(t, seq));
        setItems((xs) => xs?.map((x) => (x.seq === seq ? {...x, read: true} : x)) ?? null);
        setUnread((n) => Math.max(0, n - 1));
        refreshNotifications();
      } catch (err) {
        setError(errorText(err));
      }
    },
    [authed],
  );

  if (error && !items) {
    return (
      <ErrorState
        title="Could not load your notifications"
        action={
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </Button>
        }
      >
        {error}
      </ErrorState>
    );
  }
  if (!items) {
    return (
      <div role="status" aria-label="Loading your notifications">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState title="No notifications yet">
        <p>
          One appears when something happens on a job or a listing of yours: an offer, a bid, a draft, a
          message, a payment, or a listing that matches your skills.
        </p>
        <p className="mt-2">
          Reviews are not notifications: you see the other side&apos;s review on the job itself, once both of
          you have written one.
        </p>
        <p className="mt-2">
          <Link href="/jobs" className="underline">
            Browse jobs
          </Link>
        </p>
      </EmptyState>
    );
  }

  const shown = filter === 'unread' ? items.filter((n) => !n.read) : items;
  const groups = groupNotifications(shown);

  return (
    <Card
      title="Your notifications"
      labelledBy="notifications"
      description={
        <span aria-live="polite" data-testid="unread-count">
          {unread === 0 ? 'All read' : `${unread} unread`}
        </span>
      }
      actions={
        <>
          <div role="group" aria-label="Show" className="flex rounded-lg border border-edge p-0.5 text-xs">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-7 rounded-md px-2.5 ${filter === f ? 'bg-raised text-text' : 'text-muted hover:text-text'}`}
              >
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || unread === 0}
            onClick={() => void markAll()}
          >
            Mark all as read
          </Button>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-muted" data-testid="all-read">
          Nothing unread.
        </p>
      ) : (
        <div className="space-y-5" data-testid="notification-groups">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`group-${g.key}`} className="space-y-1">
              <h3
                id={`group-${g.key}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium"
              >
                <span>{g.title}</span>
                {g.link && (
                  <Link href={g.link.href} className="text-xs font-normal text-accent underline">
                    {g.link.label}
                  </Link>
                )}
              </h3>
              <ol aria-label={`Notifications about ${g.title}`} className="divide-y divide-edge">
                {g.items.map((n) => {
                  const link = notificationHref(n);
                  return (
                    <li
                      key={n.seq}
                      data-testid={`notification-${n.seq}`}
                      data-read={n.read ? 'yes' : 'no'}
                      className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                    >
                      <span className={n.read ? 'text-muted' : 'font-medium'}>
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {notificationText(n)}
                        <span className="ml-2 text-xs text-muted">{utc(n.at)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {!n.read && (
                          <button
                            type="button"
                            className="min-h-6 text-xs text-muted underline hover:text-text"
                            onClick={() => void markOne(n.seq)}
                            aria-label={`Mark read: ${notificationText(n)}`}
                          >
                            Mark read
                          </button>
                        )}
                        {link && g.link?.href !== link.href && (
                          <Link href={link.href} className="text-xs text-accent underline">
                            {link.label}
                          </Link>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
      {before !== null && (
        <div className="mt-4">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void older()}>
            Older
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-broken">
          {error}
        </p>
      )}
    </Card>
  );
}
