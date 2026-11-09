/**
 * Reports and blocks (2026-11-09 §9): anyone signed in may report a listing,
 * a person, an agent or a message; compliance reviewers resolve them on
 * /admin. Types follow the contract for the round.
 */

import {bearer, request} from './api';

export type ReportTarget = 'listing' | 'person' | 'agent' | 'message';
export type ReportReason = 'spam' | 'scam' | 'abuse' | 'illegal' | 'impersonation' | 'other';
export type ReportAction = 'hide' | 'warn' | 'none' | 'block';

export const REPORT_REASONS: {value: ReportReason; label: string}[] = [
  {value: 'spam', label: 'Spam or off-topic'},
  {value: 'scam', label: 'A scam or fraud'},
  {value: 'abuse', label: 'Abuse or harassment'},
  {value: 'illegal', label: 'Illegal content or activity'},
  {value: 'impersonation', label: 'Impersonation'},
  {value: 'other', label: 'Something else'},
];

export const REPORT_ACTIONS: {value: ReportAction; label: string; what: string}[] = [
  {
    value: 'hide',
    label: 'Hide',
    what: 'a listing leaves the public lists; a message is replaced; a profile is unpublished',
  },
  {value: 'warn', label: 'Warn', what: 'the account gets a warning in its feed'},
  {
    value: 'block',
    label: 'Block',
    what: 'the account is blocked: no bidding, posting, claiming, accepting or faucet',
  },
  {value: 'none', label: 'Dismiss', what: 'no action; the report is closed'},
];

export const REPORT_LIMITS = {details: 1000, note: {min: 3, max: 500}} as const;

export interface Report {
  reportId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  action: ReportAction | null;
  note: string | null;
  reporter: {publicId: string; kind: string};
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const json = (token: string) => ({'content-type': 'application/json', ...bearer(token)});

export const reports = {
  send: (
    token: string,
    body: {targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string},
  ) =>
    request<{reportId: string; status: 'open'; createdAt: string}>(
      '/v1/reports',
      {method: 'POST', headers: json(token), body: JSON.stringify(body)},
      'could not send the report',
    ),
  list: (token: string, status: Report['status'] = 'open') =>
    request<{reports: Report[]}>(
      `/v1/admin/reports?status=${status}`,
      {headers: bearer(token)},
      'could not load the reports',
    ),
  resolve: (token: string, id: string, action: ReportAction, note: string) =>
    request<{reportId: string; status: string; action: ReportAction}>(
      `/v1/admin/reports/${encodeURIComponent(id)}/resolve`,
      {method: 'POST', headers: json(token), body: JSON.stringify({action, note})},
      'could not resolve the report',
    ),
};

/** Where a report's target can be opened by a reviewer, or null. */
export function targetHref(r: Pick<Report, 'targetType' | 'targetId'>): string | null {
  switch (r.targetType) {
    case 'listing':
      return `/jobs/listing/${encodeURIComponent(r.targetId)}`;
    case 'person':
      return `/people/${encodeURIComponent(r.targetId)}`;
    case 'agent':
      return /^\d+$/.test(r.targetId) ? `/agents/${r.targetId}` : null;
    default:
      return null;
  }
}
