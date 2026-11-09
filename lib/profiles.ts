/**
 * Public profiles and two-way reviews (docs/26 F16, F17). Types are a copy
 * of the backend's views (pactora-backend-near apps/api/src/routes/
 * profiles.ts), for the reason api.ts gives.
 *
 * A profile is public only once its owner publishes it; the account id is
 * present only if they chose to show it. Reviews are blind until both
 * parties have written theirs, or 14 days after the job settled.
 */

import {bearer, request} from './api';

export type ProfileKind = 'person' | 'agent';
export type DirectorySort = 'rating' | 'recent' | 'name';

export interface ProfileSummary {
  profileId: string;
  kind: ProfileKind;
  displayName: string;
  headline: string;
  account: string | null;
  location: string | null;
  capabilities: string[];
  /** The profile's own skill tags (2026-11-09 §7); absent on an older API. */
  skills?: string[];
  /** "Open to work". */
  availability?: boolean;
  rating: {average: number | null; count: number};
  settledJobs: number;
  chainAgentId: string | null;
  publishedAt: string | null;
}

export interface ProfileReview {
  reviewId: string;
  rating: number;
  body: string;
  authorRole: 'client' | 'worker';
  /** The author's published name, or null: then the page says "a client" / "a worker". */
  author: string | null;
  jobId: string;
  at: string;
}

export interface ProfileDetail extends ProfileSummary {
  bio: string;
  reviews: ProfileReview[];
  /** Shown when the owner chose to show their task list. */
  taskList?: {
    listings: {listingId: string; title: string; status: string}[];
    jobs: {open: number; settled: number};
  };
  /** A person's stake, read from the chain; null for an agent or when not read. */
  hireable?: boolean | null;
  stake?: string | null;
}

export interface DirectoryPage {
  total: number;
  page: number;
  pageSize: number;
  sort: DirectorySort;
  profiles: ProfileSummary[];
}

export interface MyProfile {
  exists: boolean;
  published: boolean;
  displayName: string;
  headline: string;
  bio: string;
  showAccount: boolean;
  skills?: string[];
  location?: string;
  availability?: boolean;
  showTaskList?: boolean;
  alerts?: boolean;
  profileId?: string;
}

export interface ProfileForm {
  displayName: string;
  headline: string;
  bio: string;
  showAccount: boolean;
  published: boolean;
  /** At most 20, each 2-50 characters, lower-cased (2026-11-09 §7). */
  skills: string[];
  /** "City" or "City, Region", at most 120 characters. */
  location: string;
  /** Open to work. */
  availability: boolean;
  /** Show my open listings and job counts on the public profile. */
  showTaskList: boolean;
  /** Alert me to listings that match my skills and location. */
  alerts: boolean;
}

export interface PartyReview {
  reviewId: string;
  rating: number;
  body: string;
  authorRole: 'client' | 'worker';
  at: string;
  hidden: boolean;
}

export interface PartyReviews {
  jobId: string;
  role: 'client' | 'worker';
  window: {open: boolean; settledOnChain: boolean; closesAt: string | null};
  mine: PartyReview | null;
  /** `{submitted: true}` while blind; the review once revealed; null if they have not written one. */
  theirs: PartyReview | {submitted: true} | null;
  revealed: boolean;
}

export const PROFILE_LIMITS = {
  displayName: {min: 1, max: 60},
  headline: {max: 140},
  bio: {max: 2000},
  review: {min: 10, max: 2000},
  skills: {max: 20},
  skill: {min: 2, max: 50},
  location: {max: 120},
} as const;

const enc = encodeURIComponent;
const json = (token: string) => ({'content-type': 'application/json', ...bearer(token)});

export const profiles = {
  directory: (
    q: {
      q?: string;
      kind?: ProfileKind;
      sort?: DirectorySort;
      page?: number;
      available?: boolean;
      skill?: string;
    } = {},
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q))
      if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
    const qs = params.toString();
    return request<DirectoryPage>(
      `/v1/profiles${qs ? `?${qs}` : ''}`,
      signal ? {signal} : {},
      'could not load the directory',
    );
  },
  get: (id: string, signal?: AbortSignal) =>
    request<ProfileDetail>(`/v1/profiles/${enc(id)}`, signal ? {signal} : {}, 'could not load the profile'),
  mine: (token: string, signal?: AbortSignal) =>
    request<MyProfile>(
      '/v1/me/profile',
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load your profile',
    ),
  save: (token: string, form: ProfileForm) =>
    request<{profileId: string; published: boolean}>(
      '/v1/me/profile',
      {method: 'PUT', headers: json(token), body: JSON.stringify(form)},
      'could not save your profile',
    ),
  partyReviews: (token: string, jobId: string, signal?: AbortSignal) =>
    request<PartyReviews>(
      `/v1/jobs/${enc(jobId)}/party-reviews`,
      {headers: bearer(token), ...(signal ? {signal} : {})},
      'could not load the reviews',
    ),
  review: (token: string, jobId: string, body: {rating: number; body: string}) =>
    request<PartyReview & {replayed: boolean}>(
      `/v1/jobs/${enc(jobId)}/party-reviews`,
      {method: 'POST', headers: json(token), body: JSON.stringify(body)},
      'could not send the review',
    ),
};

// ─── pure helpers, unit-tested ──────────────────────────────────────────────

/** "4.5 out of 5 from 12 reviews", or "No reviews yet". */
export function ratingText(r: {average: number | null; count: number}): string {
  if (r.count === 0 || r.average === null) return 'No reviews yet';
  const avg = Number.isInteger(r.average) ? String(r.average) : r.average.toFixed(1);
  return `${avg} out of 5 from ${r.count} review${r.count === 1 ? '' : 's'}`;
}

/** Five characters, filled to the rounded rating: "★★★★☆". Decorative; ratingText is what is read out. */
export function starsOf(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** Who wrote a review, in words a stranger can read. */
export function authorText(r: Pick<ProfileReview, 'author' | 'authorRole'>): string {
  return r.author ?? (r.authorRole === 'client' ? 'A client' : 'A worker');
}

/** A problem with the profile form, or null. Trimmed, as the API trims. */
export function validateProfile(f: ProfileForm): string | null {
  const name = f.displayName.trim();
  if (name.length < PROFILE_LIMITS.displayName.min) return 'Give a display name.';
  if (name.length > PROFILE_LIMITS.displayName.max) return 'A display name is at most 60 characters.';
  if (f.headline.trim().length > PROFILE_LIMITS.headline.max) return 'A headline is at most 140 characters.';
  if (f.bio.trim().length > PROFILE_LIMITS.bio.max) return 'A bio is at most 2000 characters.';
  if (f.skills.length > PROFILE_LIMITS.skills.max) return `At most ${PROFILE_LIMITS.skills.max} skills.`;
  const bad = f.skills.find(
    (s) => s.length < PROFILE_LIMITS.skill.min || s.length > PROFILE_LIMITS.skill.max,
  );
  if (bad)
    return `A skill is ${PROFILE_LIMITS.skill.min}-${PROFILE_LIMITS.skill.max} characters: “${bad}” is not.`;
  if (f.location.trim().length > PROFILE_LIMITS.location.max) return 'A location is at most 120 characters.';
  return null;
}

/** `a, B ,a` → `['a', 'b']`: lower-cased, trimmed, de-duplicated, empties dropped. */
export function parseSkillTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const s = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** The form from what the API holds, with the five newer fields defaulted for an older API. */
export function formFromProfile(m: MyProfile): ProfileForm {
  return {
    displayName: m.displayName,
    headline: m.headline,
    bio: m.bio,
    showAccount: m.showAccount,
    published: m.published,
    skills: m.skills ?? [],
    location: m.location ?? '',
    availability: m.availability ?? false,
    showTaskList: m.showTaskList ?? false,
    alerts: m.alerts ?? false,
  };
}

/** A problem with a review, or null. */
export function validatePartyReview(rating: number, body: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Choose a rating from 1 to 5.';
  const t = body.trim();
  if (t.length < PROFILE_LIMITS.review.min || t.length > PROFILE_LIMITS.review.max)
    return 'Write 10-2000 characters about how it went.';
  return null;
}

/** Their review while blind: the type guard the page needs. */
export const isRevealed = (t: PartyReviews['theirs']): t is PartyReview => t !== null && 'rating' in t;
