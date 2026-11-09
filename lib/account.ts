/**
 * A person's own data (GDPR, 2026-11-09): the export, the two-step deletion,
 * and the bids they made. Types follow the backend's contract for the round
 * (scratchpad api-contract.md §10 and "My bids").
 */

import {API_URL, ApiError, bearer, request, UNREACHABLE} from './api';
import type {Listing, ListingStatus} from './market';

export interface MyApplication {
  applicationId: string;
  status: string;
  priceBaseUnits: string;
  priceDisplay: string;
  proposal: string;
  reason: string | null;
  jobId: string | null;
  createdAt: string;
  decidedAt: string | null;
  listing: {
    listingId: string;
    title: string;
    status: ListingStatus;
    maxPriceBaseUnits: string;
    deadline: string;
    client: Pick<Listing['client'], 'publicId' | 'name' | 'kind'>;
  };
}

export interface MyApplicationsPage {
  count: number;
  nextCursor: string | null;
  applications: MyApplication[];
}

export interface Deleted {
  deleted: true;
  account: string;
  scrubbed: Record<string, number | boolean>;
}

/** The API refused the deletion while jobs are open: their ids, to link. */
export class OpenJobsError extends Error {
  constructor(
    readonly openJobs: string[],
    detail: string,
  ) {
    super(detail);
    this.name = 'OpenJobsError';
  }
}

const json = (token: string) => ({'content-type': 'application/json', ...bearer(token)});

export const account = {
  applications: (
    token: string,
    q: {status?: string; limit?: number; cursor?: string} = {},
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
    const qs = params.toString();
    return request<MyApplicationsPage>(
      `/v1/me/applications${qs ? `?${qs}` : ''}`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load your bids',
    );
  },

  /** The export, as bytes and the file name the API gave it: handed to the browser as a download. */
  export: async (token: string): Promise<{blob: Blob; filename: string}> => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/v1/me/export`, {headers: bearer(token), cache: 'no-store'});
    } catch {
      throw new ApiError('UNREACHABLE', UNREACHABLE);
    }
    if (!res.ok) throw new ApiError('UNKNOWN', `could not export your data (${res.status})`, res.status);
    const disposition = res.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'pactora-export.json';
    return {blob: await res.blob(), filename};
  },

  deleteChallenge: (token: string) =>
    request<{nonce: string; expiresAt: string}>(
      '/v1/me/delete/challenge',
      {method: 'POST', headers: bearer(token)},
      'could not start the deletion',
    ),

  /** Throws OpenJobsError when the API refuses because jobs are open. */
  delete: async (token: string, nonce: string): Promise<Deleted> => {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/v1/me`, {
        method: 'DELETE',
        headers: json(token),
        body: JSON.stringify({nonce}),
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('UNREACHABLE', UNREACHABLE);
    }
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
      openJobs?: unknown;
    } & Partial<Deleted>;
    if (res.status === 409 && Array.isArray(body.openJobs)) {
      throw new OpenJobsError(
        body.openJobs.filter((x): x is string => typeof x === 'string'),
        body.detail ?? 'jobs are still open',
      );
    }
    if (!res.ok)
      throw new ApiError(
        body.code ?? 'UNKNOWN',
        body.detail ?? `could not delete (${res.status})`,
        res.status,
      );
    return body as Deleted;
  },
};

/** "profile, messages, drafts and 2 files" from what the API scrubbed. */
export function scrubbedWords(scrubbed: Record<string, number | boolean>): string {
  const parts = Object.entries(scrubbed)
    .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
    .map(([k, v]) => {
      const name = k.replace(/([A-Z])/g, ' $1').toLowerCase();
      return typeof v === 'number' ? `${v} ${name}` : name;
    });
  if (parts.length === 0) return 'nothing else needed removing';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
