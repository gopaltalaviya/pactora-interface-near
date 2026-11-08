/**
 * The job board's side of the API: listings, bids, jobs, `/v1/me`, and the
 * two person-action calls. Types are a copy of the backend's shapes
 * (pactora-backend-near, commit 8a8c8b2), for the reason api.ts gives.
 *
 * Every amount is a base-unit decimal STRING; nothing here uses a float.
 * Calls that need a session take its `ps_` token as the first argument; the
 * public ones take it optionally, because a bearer changes what the answer
 * says (the listing's `viewer`, `match=me`).
 */

import {bearer, formatUnits, request, type ChainId} from './api';

export type Category = 'physical' | 'expertise' | 'judgment';
export type InteractionMode = 'task' | 'conversation' | 'capture';
export type HiringMode = 'applications' | 'instant';
export type ListingStatus = 'open' | 'closed' | 'filled' | 'cancelled';
export type JobState = 'created' | 'accepted' | 'submitted' | 'disputed' | 'settled' | 'refunded';
export type PersonAction = 'create' | 'accept' | 'submit' | 'approve' | 'dispute' | 'cancel';

export const CATEGORIES: {value: Category; label: string}[] = [
  {value: 'physical', label: 'Physical'},
  {value: 'expertise', label: 'Expertise'},
  {value: 'judgment', label: 'Judgment'},
];
export const MODES: {value: InteractionMode; label: string}[] = [
  {value: 'task', label: 'Task'},
  {value: 'conversation', label: 'Conversation'},
  {value: 'capture', label: 'Capture'},
];

export interface Listing {
  listingId: string;
  chainId: ChainId;
  client: {agentId: string; kind: string; name: string; publicId: string};
  title: string;
  description: string;
  category: Category;
  interactionMode: InteractionMode;
  skills: string[];
  location: string;
  maxPriceBaseUnits: string;
  maxPriceDisplay: string;
  feeAtCeilingBaseUnits: string;
  workerReceivesAtCeilingBaseUnits: string;
  maxWorkers: number;
  slotsFilled: number;
  hiringMode: HiringMode;
  estimatedMinutes: number;
  deadline: string;
  criteria: string;
  acceptWindowSeconds: number;
  workWindowSeconds: number;
  status: ListingStatus;
  reservedBaseUnits: string;
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  applicationId: string;
  status: string;
  priceBaseUnits: string;
  priceDisplay: string;
  feeBaseUnits: string;
  workerReceivesBaseUnits: string;
  proposal: string;
  reason: string | null;
  reopenable: boolean;
  jobId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ApplicantApplication extends Application {
  applicant: {
    agentId: string;
    publicId: string;
    kind: string;
    name: string;
    location: string;
    score: number;
    completed: number;
  };
}

export type ListingViewer =
  | {isOwner: true; slots: {slot: number; jobId: string | null}[]}
  | {isOwner: false; applications: Application[]};

export type ListingDetail = Listing & {viewer?: ListingViewer};

export interface ListingQuery {
  status?: ListingStatus;
  category?: Category;
  interactionMode?: InteractionMode;
  hiringMode?: HiringMode;
  skill?: string;
  location?: string;
  match?: 'me';
  mine?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListingPage {
  count: number;
  nextCursor: string | null;
  listings: Listing[];
}

export interface ListingBody {
  title: string;
  description: string;
  category: Category;
  interactionMode: InteractionMode;
  skills?: string[];
  location?: string;
  maxPriceBaseUnits: string;
  maxWorkers: number;
  hiringMode?: HiringMode;
  estimatedMinutes: number;
  deadline: string;
  criteria: string;
  acceptWindowSeconds?: number;
  workWindowSeconds?: number;
}

export type ApplicationSort = 'recent' | 'price_low' | 'price_high' | 'rating';

export interface ApplicationsPage {
  total: number;
  page: number;
  pageSize: number;
  sort: ApplicationSort;
  applications: ApplicantApplication[];
}

export interface FunctionCallPayload {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

export interface Funding {
  by: 'signer' | 'person';
  txHash?: string;
  explorerUrl?: string;
  done?: boolean;
  signerId?: string;
  functionCall?: FunctionCallPayload;
  confirm?: string;
}

export interface Decision {
  application: Application;
  job?: {
    jobId: string;
    chainJobId: string | null;
    state: JobState;
    amount: string;
    amountDisplay: string;
    specHash: string;
    spec: unknown;
  };
  funding?: Funding;
  replayed: boolean;
}

export interface Me {
  account: string;
  chainId: ChainId;
  person: {
    publicId: string;
    agentId: string;
    chainAgentId: string;
    name: string;
    description: string | null;
    location: string | null;
    capabilities: string[];
  } | null;
  earnings: {settledCount: number; receivedBaseUnits: string};
  spentBaseUnits: string;
}

export interface JobRow {
  jobId: string;
  chainJobId: string | null;
  chainId: ChainId;
  state: JobState;
  path: string;
  amount: string;
  amountDisplay: string;
  spec: {capability?: string; [k: string]: unknown} | null;
  specHash: string;
  role: 'worker' | 'client';
  hasResult: boolean;
  resultMismatch: boolean;
  clientAgentId: string;
  workerAgentId: string;
  createdAt: string;
}

export interface JobEventRow {
  kind: string;
  txHash: string | null;
  explorerUrl: string | null;
  occurredAt: string;
}

export interface JobDetail {
  jobId: string;
  chainJobId: string | null;
  chainId: ChainId;
  network: string;
  state: JobState;
  path: string;
  amount: string;
  amountDisplay: string;
  fee: string | null;
  spec: {capability?: string; [k: string]: unknown} | null;
  specHash: string;
  result: unknown;
  resultHash: string | null;
  resultMismatch: boolean;
  clientAgentId: string;
  workerAgentId: string;
  createdAt: string;
  settledAt: string | null;
  events: JobEventRow[];
  declined: {reason: string; at: string} | null;
  dispute: {reason: string; reasonHash: string; at: string} | null;
}

export interface PreparedAction {
  jobId: string;
  action: PersonAction;
  signerId: string;
  functionCall: FunctionCallPayload;
  expectedEvent: string;
  resultHash?: string;
  reasonHash?: string;
}

export interface ConfirmedAction {
  jobId: string;
  action: PersonAction;
  txHash: string;
  state: JobState;
  chainJobId: string | null;
  resultMismatch: boolean;
  explorerUrl: string | null;
  replayed: boolean;
}

export type PrepareExtra = {output?: Record<string, unknown>; producedAt?: string; reason?: string};

const json = (token: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  ...bearer(token),
  ...extra,
});

function query(q: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
  const text = params.toString();
  return text ? `?${text}` : '';
}

const optionalBearer = (token?: string, signal?: AbortSignal): RequestInit => ({
  ...(token ? {headers: bearer(token)} : {}),
  ...(signal ? {signal} : {}),
});

const enc = encodeURIComponent;

export const market = {
  me: (token: string, signal?: AbortSignal) =>
    request<Me>('/v1/me', optionalBearer(token, signal), 'could not read your account'),

  listings: (q: ListingQuery = {}, token?: string, signal?: AbortSignal) =>
    request<ListingPage>(
      `/v1/listings${query({...q})}`,
      optionalBearer(token, signal),
      'could not load the board',
    ),

  listing: (id: string, token?: string, signal?: AbortSignal) =>
    request<ListingDetail>(
      `/v1/listings/${enc(id)}`,
      optionalBearer(token, signal),
      'could not load the listing',
    ),

  createListing: (token: string, body: ListingBody, idempotencyKey: string) =>
    request<Listing>(
      '/v1/listings',
      {
        method: 'POST',
        headers: json(token, {'idempotency-key': idempotencyKey}),
        body: JSON.stringify(body),
      },
      'could not post the listing',
    ),

  updateListing: (token: string, id: string, patch: Partial<ListingBody>) =>
    request<Listing>(
      `/v1/listings/${enc(id)}`,
      {method: 'PATCH', headers: json(token), body: JSON.stringify(patch)},
      'could not save the listing',
    ),

  cancelListing: (token: string, id: string) =>
    request<Listing>(
      `/v1/listings/${enc(id)}`,
      {method: 'DELETE', headers: bearer(token)},
      'could not cancel the listing',
    ),

  apply: (token: string, id: string, body: {priceBaseUnits: string; proposal: string}) =>
    request<Application>(
      `/v1/listings/${enc(id)}/applications`,
      {method: 'POST', headers: json(token), body: JSON.stringify({action: 'apply', ...body})},
      'could not send the bid',
    ),

  withdraw: (token: string, id: string, applicationId?: string) =>
    request<unknown>(
      `/v1/listings/${enc(id)}/applications`,
      {
        method: 'POST',
        headers: json(token),
        body: JSON.stringify({action: 'withdraw', ...(applicationId ? {applicationId} : {})}),
      },
      'could not withdraw the bid',
    ),

  applications: (
    token: string,
    id: string,
    q: {sort?: ApplicationSort; status?: string; page?: number} = {},
  ) =>
    request<ApplicationsPage>(
      `/v1/listings/${enc(id)}/applications${query({...q})}`,
      {headers: bearer(token)},
      'could not load the bids',
    ),

  decide: (
    token: string,
    id: string,
    body: {applicationId: string; action: 'select' | 'reject'; reason: string},
  ) =>
    request<Decision>(
      `/v1/listings/${enc(id)}/decide`,
      {method: 'POST', headers: json(token), body: JSON.stringify(body)},
      'could not record the decision',
    ),

  close: (token: string, id: string) =>
    request<Listing>(
      `/v1/listings/${enc(id)}/close`,
      {method: 'POST', headers: json(token), body: '{}'},
      'could not close the listing',
    ),

  reopen: (token: string, id: string) =>
    request<Listing>(
      `/v1/listings/${enc(id)}/reopen`,
      {method: 'POST', headers: json(token), body: '{}'},
      'could not reopen the listing',
    ),

  claim: (token: string, id: string, proposal?: string) =>
    request<Decision>(
      `/v1/listings/${enc(id)}/claim`,
      {method: 'POST', headers: json(token), body: JSON.stringify(proposal ? {proposal} : {})},
      'could not claim a slot',
    ),

  jobs: (token: string, q: {limit?: number; cursor?: string} = {}, signal?: AbortSignal) =>
    request<{count: number; nextCursor: string | null; jobs: JobRow[]}>(
      `/v1/jobs${query({...q})}`,
      optionalBearer(token, signal),
      'could not load your jobs',
    ),

  job: (id: string, signal?: AbortSignal) =>
    request<JobDetail>(`/v1/jobs/${enc(id)}`, optionalBearer(undefined, signal), 'could not load the job'),

  prepare: (token: string, jobId: string, action: PersonAction, extra: PrepareExtra = {}) =>
    request<PreparedAction>(
      `/v1/jobs/${enc(jobId)}/person-actions/prepare`,
      {method: 'POST', headers: json(token), body: JSON.stringify({action, ...extra})},
      'could not prepare the action',
    ),

  confirm: (token: string, jobId: string, action: PersonAction, txHash: string) =>
    request<ConfirmedAction>(
      `/v1/jobs/${enc(jobId)}/person-actions/confirm`,
      {method: 'POST', headers: json(token), body: JSON.stringify({action, txHash})},
      'could not confirm the transaction',
    ),
};

// ─── what a person sees ─────────────────────────────────────────────────────

/** What the worker is paid at a given price: price minus fee, shown in the token's units. */
export function receivesDisplay(workerReceivesBaseUnits: string, decimals: number, symbol: string): string {
  return `${formatUnits(workerReceivesBaseUnits, decimals)} ${symbol}`.trim();
}

/** `5 USDC` from base units, for amounts the API sends without a display string. */
export function amountDisplay(base: string, decimals: number, symbol: string): string {
  return `${formatUnits(base, decimals)} ${symbol}`.trim();
}

/** A window in seconds, in the unit a person thinks in. */
export function windowDisplay(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

export const JOB_STATE_WORDS: Record<JobState, {label: string; plain: string}> = {
  created: {
    label: 'Offered',
    plain: 'Offered to the worker, who has not accepted yet.',
  },
  accepted: {label: 'In progress', plain: 'The worker accepted and is doing the work.'},
  submitted: {
    label: 'Delivered',
    plain: 'The worker delivered a result. The client can approve it (which pays the worker) or dispute it.',
  },
  disputed: {label: 'Disputed', plain: 'The client disputed the result. The arbiter decides who is paid.'},
  settled: {label: 'Settled', plain: 'Done. The worker was paid from the escrow.'},
  refunded: {label: 'Refunded', plain: 'Cancelled. The escrowed money went back to the client.'},
};

/** The sentence for a job's state, with the one case the state alone does not say: not on chain yet. */
export function jobStateWords(job: Pick<JobDetail, 'state' | 'chainJobId' | 'declined'>): {
  label: string;
  plain: string;
} {
  if (job.state === 'created' && !job.chainJobId) {
    return {
      label: 'Not funded yet',
      plain:
        'Chosen, but the job is not on chain yet. The client signs one transaction to create it and put the money in escrow.',
    };
  }
  if (job.state === 'created' && job.declined) {
    return {label: 'Declined', plain: `The worker said no: ${job.declined.reason}`};
  }
  return JOB_STATE_WORDS[job.state];
}

export type JobTone = 'settled' | 'refused' | 'broken' | 'live' | 'neutral';
export function jobTone(state: JobState): JobTone {
  return state === 'settled'
    ? 'settled'
    : state === 'disputed'
      ? 'broken'
      : state === 'refunded'
        ? 'refused'
        : state === 'created'
          ? 'neutral'
          : 'live';
}

const EVENT_WORDS: Record<string, string> = {
  'job.created': 'Job created',
  created: 'Job created on chain',
  'job.accepted': 'Accepted by the worker',
  accepted: 'Accepted on chain',
  'job.delivered': 'Result delivered',
  'job.submitted': 'Result submitted',
  submitted: 'Result submitted on chain',
  'job.declined': 'Declined by the worker',
  'job.draft.submitted': 'Draft posted by the worker',
  'job.draft.reviewed': 'Draft reviewed by the client',
  'job.file.added': 'Photo added',
  'job.file.withdrawn': 'Photo withdrawn',
  'job.message': 'Message sent',
  'job.disputed': 'Disputed by the client',
  disputed: 'Dispute recorded on chain',
  dispute_resolved: 'Dispute resolved',
  dispute_expired: 'Dispute window ended',
  dispute_bond_settled: 'Dispute bond settled',
  bond_seized: 'Worker bond seized',
  'job.settled': 'Settled',
  settled: 'Settled on chain',
  direct_paid: 'Paid directly',
  'job.refunded': 'Refunded',
  refunded: 'Refunded on chain',
};

export const eventWords = (kind: string): string => EVENT_WORDS[kind] ?? kind;

/** Every kind the job stream may name: an SSE event with no listener is dropped by the browser. */
export const JOB_EVENT_KINDS = Object.keys(EVENT_WORDS);

export type Party = 'client' | 'worker' | null;

/** Which side of a job the signed-in person is (their agent id, as a string). */
export function partyOf(
  job: Pick<JobDetail, 'clientAgentId' | 'workerAgentId'>,
  myAgentId: string | null,
): Party {
  if (!myAgentId) return null;
  if (job.clientAgentId === myAgentId) return 'client';
  if (job.workerAgentId === myAgentId) return 'worker';
  return null;
}

/**
 * The actions a party may take now, by the same rules as the API's table
 * (a worker accepts from `created` and submits from `accepted`; a client
 * creates an unfunded job, cancels an unaccepted one, approves or disputes a
 * delivery). The API and the contract still check; this decides what to offer.
 */
export function availableActions(
  job: Pick<JobDetail, 'state' | 'chainJobId' | 'resultMismatch' | 'clientAgentId' | 'workerAgentId'>,
  myAgentId: string | null,
): PersonAction[] {
  const party = partyOf(job, myAgentId);
  const onChain = Boolean(job.chainJobId);
  if (party === 'worker') {
    if (!onChain) return [];
    if (job.state === 'created') return ['accept'];
    if (job.state === 'accepted') return ['submit'];
    return [];
  }
  if (party === 'client') {
    if (job.state === 'created') return onChain ? ['cancel'] : ['create'];
    // A delivery the chain disagrees with cannot be approved; it can be disputed.
    if (job.state === 'submitted') return job.resultMismatch ? ['dispute'] : ['approve', 'dispute'];
  }
  return [];
}

/** The API allows this many bids per person on one listing, and one live bid at a time. */
export const MAX_BIDS_PER_LISTING = 3;

export interface BidStanding {
  /** A pending or selected bid: the API refuses a second until it is withdrawn. */
  live: Application | null;
  /** Bids that count against the limit (those set aside by the client stopping hiring do not). */
  used: number;
  canApply: boolean;
  /** Why not, in a sentence, or null. */
  blocked: string | null;
}

export function bidStanding(applications: Application[]): BidStanding {
  const live = applications.find((a) => a.status === 'pending' || a.status === 'selected') ?? null;
  const used = applications.filter((a) => !a.reopenable).length;
  const blocked = live
    ? live.status === 'selected'
      ? 'Your bid was selected, so there is a job for you. Find it under your jobs.'
      : 'You already have a bid waiting on this listing. Withdraw it to change your price.'
    : used >= MAX_BIDS_PER_LISTING
      ? `You have used all ${MAX_BIDS_PER_LISTING} bids you may make on one listing.`
      : null;
  return {live, used, canApply: blocked === null, blocked};
}
