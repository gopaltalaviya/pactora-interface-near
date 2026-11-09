/**
 * The client's dispute evidence (2026-11-09 §8): notes and photos added
 * while a job is submitted or disputed, read by both parties and by the
 * arbiter's desk. Off chain; the on-chain `reason_hash` stays the hash of
 * the dispute reason. The limits are the API's own, copied so a mistake is
 * said next to the field.
 */

import {bearer, request} from './api';
import type {EvidenceFile} from './evidence';

export const DISPUTE_LIMITS = {note: {min: 1, max: 2000}, notes: 10, files: 10} as const;

export interface DisputeNote {
  noteId: string;
  text: string;
  at: string;
}

export interface DisputeEvidence {
  jobId: string;
  state: string;
  reason: string | null;
  reasonHash: string | null;
  raisedAt: string | null;
  notes: DisputeNote[];
  files: EvidenceFile[];
  /** The caller is the client and the job is submitted or disputed. */
  canAttach: boolean;
}

const enc = encodeURIComponent;

export const dispute = {
  get: (token: string, jobId: string, signal?: AbortSignal) =>
    request<DisputeEvidence>(
      `/v1/jobs/${enc(jobId)}/dispute`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load the dispute evidence',
    ),
  addNote: (token: string, jobId: string, text: string) =>
    request<DisputeNote & {jobId: string}>(
      `/v1/jobs/${enc(jobId)}/dispute/notes`,
      {
        method: 'POST',
        headers: {'content-type': 'application/json', ...bearer(token)},
        body: JSON.stringify({text}),
      },
      'could not add the note',
    ),
  addPhoto: (token: string, jobId: string, file: Blob, name: string) => {
    const form = new FormData();
    form.append('file', file, name);
    return request<EvidenceFile & {metadataRemoved: string[]}>(
      `/v1/jobs/${enc(jobId)}/dispute/files`,
      {method: 'POST', headers: bearer(token), body: form},
      'could not upload the photo',
    );
  },
};

/** A problem with a note, or null. */
export function validateNote(text: string): string | null {
  const t = text.trim();
  if (t.length < DISPUTE_LIMITS.note.min) return 'Write the note first.';
  if (t.length > DISPUTE_LIMITS.note.max) return `A note is at most ${DISPUTE_LIMITS.note.max} characters.`;
  return null;
}
