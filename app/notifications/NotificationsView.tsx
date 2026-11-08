'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import {errorText, SignInGate} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Skeleton} from '@/components/ui/States';
import {notificationText, notifications, type Notification} from '@/lib/notifications';
import {useSession} from '@/lib/session';

/**
 * A signed-in person's notifications, newest first: one line per event on
 * their jobs, linking to the job. Opening the page does not mark them read;
 * the person does, with the button, so nothing is missed by a glance.
 */
export function NotificationsView() {
  const session = useSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="What happened on your jobs: offers, drafts, reviews, messages and payments."
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
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [authed, latest]);

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
      <EmptyState title="Nothing yet">
        When something happens on one of your jobs, it shows up here.{' '}
        <Link href="/jobs" className="underline">
          Browse jobs
        </Link>
      </EmptyState>
    );
  }

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
        <Button size="sm" variant="secondary" disabled={busy || unread === 0} onClick={() => void markAll()}>
          Mark all as read
        </Button>
      }
    >
      <ol aria-label="Notifications" className="divide-y divide-edge">
        {items.map((n) => (
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
            <Link href={`/jobs/${n.jobId}`} className="text-xs text-accent underline">
              Open the job
            </Link>
          </li>
        ))}
      </ol>
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
