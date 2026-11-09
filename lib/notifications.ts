/**
 * A signed-in person's notifications and the test-token faucet (docs/26 F10,
 * F23). Types are a copy of the backend's views (pactora-backend-near
 * apps/api/src/routes/agent-events.ts and faucet.ts), for the reason api.ts
 * gives. A notification is one event on one of the person's jobs — or, since
 * 2026-11-09, on a listing they posted or bid on; `seq` numbers them with no
 * gaps, so "read up to N" plus a set of single reads is the whole read state.
 *
 * The API folds the noise by default (`fold=true`): a person's own actions
 * and the chain's echo of an event already in the feed are left out, and
 * every item carries the job's or listing's title.
 */

import {bearer, request} from './api';
import {eventWords} from './market';

export type NotificationRole = 'client' | 'worker' | 'applicant' | 'match';

export interface Notification {
  seq: number;
  kind: string;
  role: NotificationRole;
  jobId: string | null;
  /** The listing the event is about, for listing and bid events (null on a plain job event). */
  listingId?: string | null;
  jobTitle?: string | null;
  listingTitle?: string | null;
  /** Who caused it: me, the other party, the system; absent on an older API. */
  actor?: 'me' | 'counterparty' | 'system' | null;
  /** The indexer's on-chain echo of an API event. */
  confirmation?: boolean;
  payload: Record<string, unknown>;
  at: string;
  read: boolean;
}

export interface NotificationsPage {
  unread: number;
  readSeq: number;
  latest: number;
  /** Pass as `before` for the next (older) page; null when this is the oldest. */
  before: number | null;
  notifications: Notification[];
}

export interface FaucetStatus {
  available: boolean;
  testnet: boolean;
  /** The person's standing; the faucet refuses a hold or a block (2026-11-09 §5). */
  standing?: 'clear' | 'hold' | 'blocked';
  amount: string;
  claimedToday: boolean;
  day: string;
  remainingToday: string;
}

export interface FaucetClaim {
  account: string;
  amount: string;
  txHash: string;
  explorerUrl: string | null;
  registered: boolean;
  from: string;
}

/** Dispatched on window when something the person did may have produced a notification: the bell asks again. */
export const REFRESH_NOTIFICATIONS = 'pactora:notifications';
export const refreshNotifications = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_NOTIFICATIONS));
};

export const notifications = {
  list: (token: string, q: {limit?: number; before?: number} = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (q.limit) params.set('limit', String(q.limit));
    if (q.before) params.set('before', String(q.before));
    const qs = params.toString();
    return request<NotificationsPage>(
      `/v1/notifications${qs ? `?${qs}` : ''}`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load your notifications',
    );
  },

  markRead: (token: string, upTo: number) =>
    request<{readSeq: number; latest: number; unread: number}>(
      '/v1/notifications/read',
      {
        method: 'POST',
        headers: {'content-type': 'application/json', ...bearer(token)},
        body: JSON.stringify({upTo}),
      },
      'could not mark them read',
    ),

  /** One item read (2026-11-09): `POST /v1/notifications/:seq/read`. */
  markOne: (token: string, seq: number) =>
    request<{seq: number; read: true}>(
      `/v1/notifications/${seq}/read`,
      {method: 'POST', headers: bearer(token)},
      'could not mark it read',
    ),

  faucet: (token: string, signal?: AbortSignal) =>
    request<FaucetStatus>(
      '/v1/faucet',
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not read the faucet',
    ),

  claim: (token: string) =>
    request<FaucetClaim>(
      '/v1/faucet',
      {method: 'POST', headers: bearer(token)},
      'could not claim test tokens',
    ),
};

/** What the header badge says: nothing at 0, the number up to 99, then "99+". */
export function badgeText(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null;
  return unread > 99 ? '99+' : String(Math.floor(unread));
}

/** The screen-reader name of the header link: the count in words a person hears. */
export function bellLabel(unread: number): string {
  const n = badgeText(unread);
  return n === null ? 'Notifications' : `Notifications, ${n} unread`;
}

/**
 * One line for a notification: what happened, and which side the person is
 * on. Words come from the same table as a job's history; a kind the site
 * does not know yet is shown as the API named it, never dropped. A listing
 * event names the bidder or the price where the payload has them.
 */
export function notificationText(
  n: Pick<Notification, 'kind' | 'role'> & {payload?: Record<string, unknown>},
): string {
  const words = eventWords(n.kind);
  const p = n.payload ?? {};
  if (n.kind === 'listing.bid') {
    const who = (p['applicant'] as {name?: unknown} | undefined)?.name;
    return typeof who === 'string'
      ? `${words} from ${who} — you are the client`
      : `${words} — you are the client`;
  }
  if (n.role === 'applicant') return `${words} — your bid`;
  if (n.role === 'match') return words;
  return `${words} — you are the ${n.role}`;
}

/** Where a notification leads: the job, else the listing, else nowhere. */
export function notificationHref(
  n: Pick<Notification, 'jobId' | 'listingId'>,
): {href: string; label: string} | null {
  if (n.jobId) return {href: `/jobs/${n.jobId}`, label: 'Open the job'};
  if (n.listingId)
    return {href: `/jobs/listing/${encodeURIComponent(n.listingId)}`, label: 'Open the listing'};
  return null;
}

export interface NotificationGroup {
  key: string;
  title: string;
  link: {href: string; label: string} | null;
  items: Notification[];
}

/** Grouped by the job or listing they are about, in the order of their newest item. */
export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of items) {
    const key = n.jobId ? `job:${n.jobId}` : n.listingId ? `listing:${n.listingId}` : `other:${n.seq}`;
    let g = groups.get(key);
    if (!g) {
      const title =
        (n.jobId ? n.jobTitle : null) ??
        n.listingTitle ??
        n.jobTitle ??
        (n.jobId ? 'A job' : n.listingId ? 'A listing' : 'Your account');
      g = {key, title, link: notificationHref(n), items: []};
      groups.set(key, g);
    }
    g.items.push(n);
  }
  return [...groups.values()];
}
