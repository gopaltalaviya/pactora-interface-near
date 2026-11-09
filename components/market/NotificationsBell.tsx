'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';
import {badgeText, bellLabel, notifications, REFRESH_NOTIFICATIONS} from '@/lib/notifications';
import {useSession} from '@/lib/session';

/**
 * The header's link to /notifications with the unread count, for a signed-in
 * person. It asks again every 30 s and on every page change; nothing is
 * shown while signed out or for an account with no person record. Those are
 * not asked at all: the API answers 403, which the browser logs as an error
 * on every page an admin or reviewer without a person record opens.
 */
export function NotificationsBell() {
  const {status, person, authed} = useSession();
  const hasPerson = person !== null;
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'in' || !hasPerson) {
      setUnread(null);
      return;
    }
    const controller = new AbortController();
    const read = () =>
      authed((t) => notifications.list(t, {limit: 1}, controller.signal))
        .then((p) => setUnread(p.unread))
        .catch(() => {
          if (!controller.signal.aborted) setUnread(null);
        });
    void read();
    // Every 30 s, and at once after something the person did on this tab (a
    // bid, an action, a read), so the count does not lag an action by half a minute.
    const timer = setInterval(() => void read(), 30_000);
    const onRefresh = () => void read();
    window.addEventListener(REFRESH_NOTIFICATIONS, onRefresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener(REFRESH_NOTIFICATIONS, onRefresh);
    };
  }, [status, hasPerson, authed, pathname]);

  if (unread === null) return null;
  const badge = badgeText(unread);
  return (
    <Link
      href="/notifications"
      aria-label={bellLabel(unread)}
      data-testid="notifications-bell"
      className="relative inline-flex h-8 shrink-0 items-center rounded-lg border border-edge px-2.5 text-xs text-muted transition-colors hover:border-edge-strong hover:text-text"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {badge && (
        <span
          aria-hidden
          data-testid="notifications-badge"
          className="tabular ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-ink"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
