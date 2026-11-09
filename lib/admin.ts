/**
 * The admin console's side of the API (docs/26 F15). Types are a copy of the
 * backend's views (pactora-backend-near apps/api/src/routes/admin.ts and
 * kyc.ts). The API builds a ruling's calls; the member's own wallet signs
 * them; the DAO's vote is what moves money.
 */

import {API_URL, ApiError, bearer, request, UNREACHABLE} from './api';

export type AdminRole = 'council' | 'reviewer';

export interface AdminMe {
  account: string;
  chainId: string;
  roles: AdminRole[];
  arbiterDao: string | null;
  /** The arbiter account: the DAO, or a plain account on a chain without one (2026-11-09). */
  arbiter?: string | null;
}

export interface BuiltCall {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

export interface Dispute {
  jobId: string;
  chainJobId: string | null;
  state: string;
  amount: string;
  resultHash: string | null;
  resultMismatch: boolean;
  client: {agentId: number; name: string | null};
  worker: {agentId: number; name: string | null};
  result: unknown;
  disputeReason: string | null;
  drafts: {round: number; snapshotHash: string; snapshot: {text?: string}}[];
  files: {
    fileId: string;
    sha256: string;
    mime: string;
    size: number;
    withdrawnAt: string | null;
    url: string;
  }[];
  messages: {messageId: string; from: 'client' | 'worker'; body: string; at: string}[];
  timeline: {kind: string; txHash: string | null; at: string}[];
  /** The client's dispute notes and photos (2026-11-09 §8); absent on an older API. */
  disputeNotes?: {noteId: string; text: string; at: string}[];
  disputeFiles?: {fileId: string; sha256: string; mime: string; size: number; url: string}[];
  evidenceHash: string;
}

export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  status: string;
  votes: Record<string, string>;
  forWorker: boolean;
  youVoted: string | null;
}

export interface AdminReview {
  reviewId: string;
  rating: number;
  body: string;
  authorRole: string;
  at: string;
  hidden: boolean;
  hiddenReason: string | null;
}

export interface ComplianceCase {
  caseId: string;
  subjectAccount: string;
  source: string;
  entryRef: string;
  queryName: string;
  matchedName: string;
  score: number;
  strength: 'strong' | 'weak';
  status: string;
  version: number;
  decisions: {reviewer: string; decision: string; reason: string; at: string}[];
}

const enc = encodeURIComponent;
const json = (token: string) => ({'content-type': 'application/json', ...bearer(token)});
const get = <T>(token: string, path: string, what: string) =>
  request<T>(path, {headers: bearer(token)}, what);
const post = <T>(token: string, path: string, body: unknown, what: string) =>
  request<T>(path, {method: 'POST', headers: json(token), body: JSON.stringify(body)}, what);

export const admin = {
  me: (token: string) => get<AdminMe>(token, '/v1/admin/me', 'could not read your admin roles'),
  disputes: (token: string) =>
    get<{arbiterDao: string | null; disputes: {jobId: string; chainJobId: string | null; amount: string}[]}>(
      token,
      '/v1/admin/disputes',
      'could not load the disputes',
    ),
  dispute: (token: string, id: string) =>
    get<Dispute>(token, `/v1/admin/disputes/${enc(id)}`, 'could not load the dispute'),
  proposals: (token: string, id: string) =>
    get<{dao?: string; council?: string[]; proposals: Proposal[]}>(
      token,
      `/v1/admin/disputes/${enc(id)}/proposals`,
      'could not read the proposals',
    ),
  propose: (token: string, id: string, forWorker: boolean, evidenceHash: string) =>
    post<{dao: string; functionCall: BuiltCall}>(
      token,
      `/v1/admin/disputes/${enc(id)}/proposal`,
      {forWorker, evidenceHash},
      'could not build the proposal',
    ),
  vote: (token: string, id: string, pid: number, action: 'VoteApprove' | 'VoteReject') =>
    post<{dao: string; functionCall: BuiltCall}>(
      token,
      `/v1/admin/disputes/${enc(id)}/proposals/${pid}/vote`,
      {action},
      'could not build the vote',
    ),
  reviews: (token: string) =>
    get<{reviews: AdminReview[]}>(token, '/v1/admin/reviews', 'could not load the reviews'),
  hide: (token: string, id: string, reason: string) =>
    post<{hidden: true}>(token, `/v1/admin/reviews/${enc(id)}/hide`, {reason}, 'could not hide the review'),
  cases: (token: string, status = 'open') =>
    get<{cases: ComplianceCase[]}>(
      token,
      `/v1/compliance/cases?status=${enc(status)}`,
      'could not load the cases',
    ),
  decide: (token: string, id: string, decision: 'clear' | 'confirm', reason: string, caseVersion: number) =>
    post<{status: string; version: number; clearsSoFar: number}>(
      token,
      `/v1/compliance/cases/${enc(id)}/decisions`,
      {decision, reason, caseVersion},
      'could not record the decision',
    ),
  /** An evidence photo's bytes (council only), for a blob URL. */
  file: async (token: string, url: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}${url}`, {headers: bearer(token), cache: 'no-store'});
    } catch {
      throw new ApiError('UNREACHABLE', UNREACHABLE);
    }
    if (!res.ok) throw new ApiError('UNKNOWN', `could not load the file (${res.status})`, res.status);
    return res.blob();
  },
};

/** "2 of 3 approve, 0 reject" from a proposal's votes and the council size. */
export function tally(p: Pick<Proposal, 'votes'>, councilSize: number): string {
  const v = Object.values(p.votes);
  const yes = v.filter((x) => x === 'Approve').length;
  const no = v.filter((x) => x === 'Reject').length;
  return `${yes} of ${councilSize} approve, ${no} reject`;
}

/** What a ruling does, in words. */
export const rulingWords = (forWorker: boolean) => (forWorker ? 'Pay the worker' : 'Refund the client');
