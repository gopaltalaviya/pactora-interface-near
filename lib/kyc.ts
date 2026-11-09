/**
 * Identity checks and standing (docs/26 F13, F14). Types are a copy of the
 * backend's views (pactora-backend-near apps/api/src/routes/kyc.ts).
 *
 * The site never decides anything here: it shows what the API says, and
 * labels a simulated provider as simulated wherever it appears.
 */

import {bearer, request} from './api';

export type Standing = 'clear' | 'hold' | 'blocked';
export type KycStatus =
  'screening' | 'held' | 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled_cleared';

export interface KycState {
  standing: Standing;
  provider: {name: string; simulated: boolean} | null;
  screening: boolean;
  walletScreening: string;
  verification: {
    verificationId: string;
    provider: string;
    status: KycStatus;
    documentVerified: boolean;
    createdAt: string;
    decidedAt: string | null;
  } | null;
}

export interface KycStart {
  verificationId: string;
  status: KycStatus;
  url?: string;
  simulated?: boolean;
  next?: string;
  replayed?: boolean;
}

const json = (token: string) => ({'content-type': 'application/json', ...bearer(token)});

export const kyc = {
  state: (token: string, signal?: AbortSignal) =>
    request<KycState>(
      '/v1/kyc',
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not read your identity check',
    ),
  start: (token: string, legalName: string) =>
    request<KycStart>(
      '/v1/kyc/start',
      {method: 'POST', headers: json(token), body: JSON.stringify({legalName})},
      'could not start the identity check',
    ),
  completeSimulated: (
    token: string,
    sessionId: string,
    outcome: 'approved' | 'rejected',
    documentVerified: boolean,
  ) =>
    request<{status: KycStatus; simulated: true}>(
      `/v1/kyc/simulated/${encodeURIComponent(sessionId)}`,
      {method: 'POST', headers: json(token), body: JSON.stringify({outcome, documentVerified})},
      'could not complete the simulated check',
    ),
};

export const STATUS_WORDS: Record<KycStatus, string> = {
  screening: 'Being screened.',
  held: 'On hold: a compliance review is needed before the check can start. You will be told the outcome.',
  pending: 'Waiting for the identity provider.',
  approved: 'Verified.',
  rejected: 'Not verified. You can start again.',
  expired: 'Expired without finishing. You can start again.',
  cancelled_cleared: 'The compliance hold was cleared. You can start the check now.',
};

export const STANDING_WORDS: Record<Standing, string> = {
  clear: 'Clear',
  hold: 'On hold while a compliance review is open: applying, claiming and accepting work are paused.',
  blocked: 'Blocked after a compliance review.',
};

/** A problem with the legal name, or null. */
export function validateLegalName(name: string): string | null {
  const t = name.trim();
  if (t.length < 2 || t.length > 200) return 'Give your full legal name, 2-200 characters.';
  return null;
}

/** Whether a new check may be started from this state. */
export function canStart(s: KycState): boolean {
  if (!s.provider || s.standing === 'blocked') return false;
  const st = s.verification?.status;
  // A `held` row is a dead end only while the hold is on: cleared, the person
  // may start (the API then closes the held row; live audit 2026-11-09).
  if (st === 'held') return s.standing === 'clear';
  return st === undefined || st === 'rejected' || st === 'expired' || st === 'cancelled_cleared';
}

/** The simulated session id in a provider URL, if it is ours. */
export function simulatedSessionOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const s = u.searchParams.get('session');
    return u.pathname === '/kyc/simulated' && s && /^sim_[0-9a-f]{24}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}
