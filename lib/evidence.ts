/**
 * A listing job's delivery side of the API (docs/26 F6–F8): evidence photos,
 * draft rounds with the client's review, and the job's chat. Types are a copy
 * of the backend's views (pactora-backend-near apps/api/src/routes/files.ts,
 * drafts.ts, messages.ts), for the reason api.ts gives.
 *
 * Only the two parties can call any of this, with their session token. A
 * photo is behind that token too, so the page fetches its bytes and shows a
 * blob URL; a bare <img src> to the API would be refused.
 *
 * The limits are the API's own, copied so a mistake is said next to the field;
 * the API checks again.
 */

import {API_URL, ApiError, bearer, request, UNREACHABLE} from './api';
import type {JobDetail, PersonAction} from './market';

export const EVIDENCE_LIMITS = {
  draftText: {min: 10, max: 10_000},
  reviewReason: {min: 10, max: 2000},
  checks: {min: 1, max: 30},
  criterion: {max: 500},
  support: {max: 2000},
  message: {min: 1, max: 4000},
  maxBytes: 8 * 1024 * 1024,
  revisions: 3,
} as const;

/** What the API accepts, by the file's first bytes (the API decides; this only saves a round trip). */
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface EvidenceFile {
  fileId: string;
  sha256: string;
  mime: string;
  size: number;
  createdAt: string;
  withdrawnAt: string | null;
  url: string;
}

export interface FilesPage {
  jobId: string;
  active: number;
  total: number;
  limits: {maxActive: number; maxTotal: number; maxBytes: number};
  files: EvidenceFile[];
}

export interface ReviewCheck {
  criterion: string;
  met: boolean;
  support: string;
}

export type ReviewDecision = 'revise' | 'accept_draft' | 'dispute_intent';

export interface DraftReview {
  reviewId: string;
  decision: ReviewDecision;
  reason: string;
  checks: ReviewCheck[];
  reviewHash: string;
  decidedAt: string;
}

export interface SnapshotFile {
  fileId: string;
  sha256: string;
  mime: string;
  size: number;
}

export interface Snapshot {
  v: 1;
  jobId: string;
  specHash: string;
  round: number;
  terms: unknown;
  text: string;
  output: Record<string, unknown> | null;
  files: SnapshotFile[];
  messages: {
    messageId: string;
    from: 'client' | 'worker';
    body: string;
    inReplyTo: string | null;
    at: string;
  }[];
}

export interface Draft {
  draftId: string;
  round: number;
  snapshotHash: string;
  snapshot: Snapshot;
  createdAt: string;
  review: DraftReview | null;
}

export type DraftPhase = 'none' | 'awaiting_review' | 'revise' | 'accepted' | 'dispute_intent';

export interface DraftsSummary {
  jobId: string;
  phase: DraftPhase;
  revisionsUsed: number;
  revisionsLeft: number;
  acceptedSnapshotHash: string | null;
  acceptedReviewHash: string | null;
  readyToApprove: boolean;
  resultMismatch: boolean;
}

export interface DraftsPage extends DraftsSummary {
  role: 'client' | 'worker';
  drafts: Draft[];
}

export interface Message {
  messageId: string;
  from: 'client' | 'worker';
  body: string;
  inReplyTo: string | null;
  at: string;
}

export interface MessagesPage {
  jobId: string;
  role: 'client' | 'worker';
  writable: boolean;
  count: number;
  limit: number;
  note: string;
  messages: Message[];
}

const enc = encodeURIComponent;
const json = (token: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  ...bearer(token),
  ...extra,
});

export const evidence = {
  files: (token: string, jobId: string, signal?: AbortSignal) =>
    request<FilesPage>(
      `/v1/jobs/${enc(jobId)}/files`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load the photos',
    ),

  /** Multipart, field `file`. The browser sets the boundary, so no content-type here. */
  upload: (token: string, jobId: string, file: Blob, name: string) => {
    const form = new FormData();
    form.append('file', file, name);
    return request<EvidenceFile & {jobId: string; metadataRemoved: string[]}>(
      `/v1/jobs/${enc(jobId)}/files`,
      {method: 'POST', headers: bearer(token), body: form},
      'could not upload the photo',
    );
  },

  withdraw: (token: string, jobId: string, fileId: string) =>
    request<EvidenceFile & {replayed: boolean}>(
      `/v1/jobs/${enc(jobId)}/files/${enc(fileId)}`,
      {method: 'DELETE', headers: bearer(token)},
      'could not withdraw the photo',
    ),

  /** A photo's bytes, for a blob URL. Its sha256 is checked against the one the API listed. */
  photo: async (token: string, fileId: string, signal?: AbortSignal): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/v1/files/${enc(fileId)}`, {
        cache: 'no-store',
        headers: bearer(token),
        ...(signal ? {signal} : {}),
      });
    } catch (err) {
      if ((err as {name?: string})?.name === 'AbortError') throw err;
      throw new ApiError('UNREACHABLE', UNREACHABLE);
    }
    if (!res.ok) throw new ApiError('UNKNOWN', `could not load the photo (${res.status})`, res.status);
    return res.blob();
  },

  drafts: (token: string, jobId: string, signal?: AbortSignal) =>
    request<DraftsPage>(
      `/v1/jobs/${enc(jobId)}/drafts`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load the drafts',
    ),

  postDraft: (token: string, jobId: string, body: {text: string; output?: Record<string, unknown>}) =>
    request<DraftsSummary & Draft & {replayed: boolean}>(
      `/v1/jobs/${enc(jobId)}/drafts`,
      {method: 'POST', headers: json(token), body: JSON.stringify(body)},
      'could not post the draft',
    ),

  review: (
    token: string,
    jobId: string,
    draftId: string,
    body: {snapshotHash: string; decision: ReviewDecision; reason: string; checks: ReviewCheck[]},
  ) =>
    request<DraftsSummary & {review: DraftReview; next: string; replayed: boolean}>(
      `/v1/jobs/${enc(jobId)}/drafts/${enc(draftId)}/review`,
      {method: 'POST', headers: json(token), body: JSON.stringify(body)},
      'could not record the review',
    ),

  messages: (token: string, jobId: string, signal?: AbortSignal) =>
    request<MessagesPage>(
      `/v1/jobs/${enc(jobId)}/messages`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load the conversation',
    ),

  send: (token: string, jobId: string, body: string, idempotencyKey: string) =>
    request<Message & {jobId: string; replayed: boolean}>(
      `/v1/jobs/${enc(jobId)}/messages`,
      {
        method: 'POST',
        headers: json(token, {'idempotency-key': idempotencyKey}),
        body: JSON.stringify({body}),
      },
      'could not send the message',
    ),
};

// ─── pure helpers, unit-tested ──────────────────────────────────────────────

/**
 * A job made from a listing bid is delivered through drafts (the API refuses
 * a bare submission). Its spec carries the listing, whose criteria are what
 * the client checks.
 */
export function listingTermsOf(
  job: Pick<JobDetail, 'spec'>,
): {title: string; criteria: string; description: string} | null {
  const input = job.spec?.['input'];
  if (!input || typeof input !== 'object') return null;
  const listing = (input as {listing?: unknown}).listing;
  if (!listing || typeof listing !== 'object') return null;
  const l = listing as Record<string, unknown>;
  if (typeof l['criteria'] !== 'string') return null;
  return {
    title: typeof l['title'] === 'string' ? l['title'] : '',
    criteria: l['criteria'],
    description: typeof l['description'] === 'string' ? l['description'] : '',
  };
}

/**
 * The listing's criteria, one check per line: list markers (`-`, `*`, `•`,
 * `1.`, `1)`) are dropped, blank lines skipped, each cut to the API's 500
 * characters, at most 30. A criteria text without line breaks is one check.
 */
export function criteriaToChecks(criteria: string): string[] {
  const lines = criteria
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 0)
    .map((l) => l.slice(0, EVIDENCE_LIMITS.criterion.max));
  return lines.slice(0, EVIDENCE_LIMITS.checks.max);
}

/**
 * A listing job is delivered through drafts: submitting waits for an
 * accepted draft (the API refuses it before), and approving waits until the
 * chain holds that draft's hash. Until the drafts are read, neither is shown.
 */
export function gateForDrafts(
  actions: PersonAction[],
  drafts: DraftsPage | null | undefined,
): PersonAction[] {
  if (drafts === undefined) return actions;
  return actions.filter((a) => {
    if (a === 'submit') return drafts?.phase === 'accepted';
    if (a === 'approve') return drafts?.readyToApprove === true;
    return true;
  });
}

/** A problem with a draft's text, or null. */
export function validateDraftText(text: string): string | null {
  const t = text.trim();
  const {min, max} = EVIDENCE_LIMITS.draftText;
  if (t.length < min || t.length > max) return `Describe the work in ${min}-${max} characters.`;
  return null;
}

/**
 * A problem with a review, or null. accept_draft needs every check met (the
 * API refuses otherwise); revise has to say what to change, and is refused
 * once the 3 revisions are used.
 */
export function validateReview(
  decision: ReviewDecision,
  reason: string,
  checks: ReviewCheck[],
  revisionsLeft: number,
): string | null {
  const r = reason.trim();
  const {min, max} = EVIDENCE_LIMITS.reviewReason;
  if (checks.length < EVIDENCE_LIMITS.checks.min) return 'Add at least one check.';
  if (checks.length > EVIDENCE_LIMITS.checks.max) return `At most ${EVIDENCE_LIMITS.checks.max} checks.`;
  if (checks.some((c) => c.criterion.trim().length === 0)) return 'Every check needs its criterion.';
  if (decision === 'accept_draft' && checks.some((c) => !c.met))
    return 'Accepting needs every check met. Ask for a revision, or say you will dispute.';
  if (decision === 'revise' && revisionsLeft <= 0)
    return 'All 3 revisions are used. Accept the draft or say you will dispute.';
  if (r.length < min || r.length > max) return `Give your reason in ${min}-${max} characters.`;
  return null;
}

/** A problem with a chat message, or null. */
export function validateMessage(body: string): string | null {
  if (body.trim().length === 0) return 'Write a message first.';
  if (body.length > EVIDENCE_LIMITS.message.max)
    return `A message is at most ${EVIDENCE_LIMITS.message.max} characters.`;
  return null;
}

/** A problem with a chosen photo, or null. The API checks the bytes; this checks what the browser says. */
export function validatePhoto(file: {size: number; type: string}): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type))
    return 'Only PNG, JPEG or WebP photos are taken.';
  if (file.size > EVIDENCE_LIMITS.maxBytes) return 'A photo is at most 8 MiB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export const PHASE_WORDS: Record<DraftPhase, string> = {
  none: 'No draft yet. The worker posts one when the work is done.',
  awaiting_review: 'A draft is waiting for the client’s review.',
  revise: 'The client asked for a revision. The worker posts the next draft.',
  accepted: 'The client accepted a draft. The worker submits it on chain, then the payment follows.',
  dispute_intent: 'The client said they will dispute. No more drafts are taken.',
};

export const DECISION_WORDS: Record<ReviewDecision, string> = {
  revise: 'Revision asked',
  accept_draft: 'Accepted',
  dispute_intent: 'Will dispute',
};

/** 1536 → "1.5 KiB". */
export function bytesDisplay(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, '')} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MiB`;
}

/** sha256 of a blob, lowercase hex, to compare a downloaded photo with the hash the API listed. */
export async function sha256OfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
