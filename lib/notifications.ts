/**
 * A signed-in person's notifications and the test-token faucet (docs/26 F10,
 * F23). Types are a copy of the backend's views (pactora-backend-near
 * apps/api/src/routes/agent-events.ts and faucet.ts), for the reason api.ts
 * gives. A notification is one event on one of the person's jobs; `seq`
 * numbers them with no gaps, so "read up to N" is the whole read state.
 */

import {bearer, request} from './api';
import {eventWords} from './market';

export interface Notification {
  seq: number;
  kind: string;
  role: 'client' | 'worker';
  jobId: string;
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
 * One line for a notification: what happened, and which side of the job the
 * person is on. Words come from the same table as a job's history; a kind
 * the site does not know yet is shown as the API named it, never dropped.
 */
export function notificationText(n: Pick<Notification, 'kind' | 'role'>): string {
  return `${eventWords(n.kind)} — you are the ${n.role}`;
}
