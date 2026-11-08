/**
 * The create-listing form: what a person typed → the API's body, or what is
 * wrong with it, field by field.
 *
 * The limits are the API's own (pactora-backend-near apps/api/src/routes/
 * listings.ts, `ListingFields`), copied so a mistake is said next to the field
 * instead of as a 400 after a click. The API checks again; this is courtesy,
 * not security. Text is trimmed and one-line fields have their whitespace
 * collapsed exactly as the API does, so what is validated is what is sent.
 */

import type {Category, HiringMode, InteractionMode, ListingBody} from './market';
import {ApiError} from './api';
import {parseUnits} from './near';

export const LIMITS = {
  title: {min: 5, max: 140},
  description: {min: 10, max: 5000},
  criteria: {min: 10, max: 3000},
  location: {max: 120},
  skill: {min: 2, max: 50},
  skills: {max: 20},
  workers: {min: 1, max: 20},
  estimatedMinutes: {min: 1, max: 10_080},
  proposal: {min: 20, max: 3000},
  reason: {min: 10, max: 2000},
} as const;

/** The contract's longest work window on testnet: 5 hours. The API enforces the chain's own maximum. */
export const MAX_WORK_WINDOW_MINUTES = 300;

export interface ListingDraft {
  title: string;
  description: string;
  category: Category | '';
  interactionMode: InteractionMode | '';
  skills: string;
  location: string;
  /** In the payment token's units, as typed: `5` or `2.5`. */
  price: string;
  maxWorkers: string;
  hiringMode: HiringMode;
  estimatedMinutes: string;
  /** A `datetime-local` value, in the person's own time zone. */
  deadline: string;
  criteria: string;
  /** Optional; empty means the chain's default. */
  acceptMinutes: string;
  workMinutes: string;
}

export const EMPTY_DRAFT: ListingDraft = {
  title: '',
  description: '',
  category: '',
  interactionMode: '',
  skills: '',
  location: '',
  price: '',
  maxWorkers: '1',
  hiringMode: 'applications',
  estimatedMinutes: '',
  deadline: '',
  criteria: '',
  acceptMinutes: '',
  workMinutes: '',
};

export type DraftErrors = Partial<Record<keyof ListingDraft, string>>;

export interface FormContext {
  decimals: number;
  /** Epoch ms, for "the deadline is in the future". */
  now: number;
  /** The escrow's smallest and largest job, base units, when the network says. */
  minJobAmount?: string | undefined;
  maxJobAmount?: string | undefined;
  symbol?: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** `a, b` → `['a','b']`: lowercased, one-lined, de-duplicated, empties dropped. */
export function parseSkills(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const skill = oneLine(raw).toLowerCase();
    if (skill && !out.includes(skill)) out.push(skill);
  }
  return out;
}

function wholeNumber(text: string): number | null {
  return /^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : null;
}

function lengthError(value: string, label: string, min: number, max: number): string | undefined {
  if (value.length < min) return `${label} is at least ${min} characters (now ${value.length}).`;
  if (value.length > max) return `${label} is at most ${max} characters (now ${value.length}).`;
  return undefined;
}

const gt = (a: string, b: string) => BigInt(a) > BigInt(b);

export function validateListing(
  draft: ListingDraft,
  ctx: FormContext,
): {errors: DraftErrors; body: ListingBody | null} {
  const errors: DraftErrors = {};
  const set = (field: keyof ListingDraft, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  const title = oneLine(draft.title);
  set('title', lengthError(title, 'The title', LIMITS.title.min, LIMITS.title.max));
  const description = draft.description.trim();
  set(
    'description',
    lengthError(description, 'The description', LIMITS.description.min, LIMITS.description.max),
  );
  const criteria = draft.criteria.trim();
  set('criteria', lengthError(criteria, 'The acceptance criteria', LIMITS.criteria.min, LIMITS.criteria.max));
  if (!draft.category) set('category', 'Choose a category.');
  if (!draft.interactionMode) set('interactionMode', 'Choose how the work is done.');

  const skills = parseSkills(draft.skills);
  if (skills.length > LIMITS.skills.max) set('skills', `At most ${LIMITS.skills.max} skills.`);
  const badSkill = skills.find((s) => s.length < LIMITS.skill.min || s.length > LIMITS.skill.max);
  if (badSkill)
    set('skills', `A skill is ${LIMITS.skill.min}-${LIMITS.skill.max} characters: “${badSkill}” is not.`);

  const location = oneLine(draft.location);
  if (location.length > LIMITS.location.max) set('location', `At most ${LIMITS.location.max} characters.`);

  const priceUnits = parseUnits(draft.price, ctx.decimals);
  const sym = ctx.symbol ? ` ${ctx.symbol}` : '';
  if (!draft.price.trim()) set('price', 'Enter the most you will pay one worker.');
  else if (priceUnits === null || /^0+$/.test(priceUnits))
    set('price', `Enter an amount above 0 with at most ${ctx.decimals} decimals, like 2.5.`);
  else if (ctx.minJobAmount && gt(ctx.minJobAmount, priceUnits))
    set('price', `The smallest job is ${formatBase(ctx.minJobAmount, ctx.decimals)}${sym}.`);
  else if (ctx.maxJobAmount && gt(priceUnits, ctx.maxJobAmount))
    set('price', `The largest job is ${formatBase(ctx.maxJobAmount, ctx.decimals)}${sym}.`);

  const workers = wholeNumber(draft.maxWorkers);
  if (workers === null || workers < LIMITS.workers.min || workers > LIMITS.workers.max)
    set('maxWorkers', `Between ${LIMITS.workers.min} and ${LIMITS.workers.max} workers.`);

  const minutes = wholeNumber(draft.estimatedMinutes);
  if (minutes === null || minutes < LIMITS.estimatedMinutes.min || minutes > LIMITS.estimatedMinutes.max)
    set(
      'estimatedMinutes',
      `Between ${LIMITS.estimatedMinutes.min} minute and ${LIMITS.estimatedMinutes.max} minutes (one week).`,
    );

  let deadlineIso: string | null = null;
  if (!draft.deadline) set('deadline', 'Choose a deadline.');
  else {
    const t = new Date(draft.deadline).getTime();
    if (Number.isNaN(t)) set('deadline', 'That is not a date and time.');
    else if (t <= ctx.now) set('deadline', 'The deadline has to be in the future.');
    else deadlineIso = new Date(t).toISOString();
  }

  let accept: number | null = null;
  if (draft.acceptMinutes.trim()) {
    const m = wholeNumber(draft.acceptMinutes);
    if (m === null || m < 1)
      set('acceptMinutes', 'Whole minutes, at least 1 — or leave it empty for the default.');
    else accept = m * 60;
  }
  let work: number | null = null;
  if (draft.workMinutes.trim()) {
    const m = wholeNumber(draft.workMinutes);
    if (m === null || m < 1)
      set('workMinutes', 'Whole minutes, at least 1 — or leave it empty for the default.');
    else if (m > MAX_WORK_WINDOW_MINUTES)
      set(
        'workMinutes',
        `At most ${MAX_WORK_WINDOW_MINUTES} minutes (5 hours): the testnet contract refuses a longer work window. Split the task or shorten it.`,
      );
    else work = m * 60;
  }

  if (Object.keys(errors).length > 0 || priceUnits === null || deadlineIso === null)
    return {errors, body: null};

  const body: ListingBody = {
    title,
    description,
    category: draft.category as Category,
    interactionMode: draft.interactionMode as InteractionMode,
    ...(skills.length > 0 ? {skills} : {}),
    ...(location ? {location} : {}),
    maxPriceBaseUnits: priceUnits,
    maxWorkers: workers as number,
    hiringMode: draft.hiringMode,
    estimatedMinutes: minutes as number,
    deadline: deadlineIso,
    criteria,
    ...(accept !== null ? {acceptWindowSeconds: accept} : {}),
    ...(work !== null ? {workWindowSeconds: work} : {}),
  };
  return {errors, body};
}

function formatBase(base: string, decimals: number): string {
  const digits = base.padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** A bid or a decision, with the API's own limits. */
export function validateBid(
  priceText: string,
  proposal: string,
  ctx: {decimals: number; ceiling: string},
): {errors: {price?: string; proposal?: string}; body: {priceBaseUnits: string; proposal: string} | null} {
  const errors: {price?: string; proposal?: string} = {};
  const units = parseUnits(priceText, ctx.decimals);
  if (!priceText.trim()) errors.price = 'Enter your price.';
  else if (units === null || /^0+$/.test(units))
    errors.price = `Enter an amount above 0 with at most ${ctx.decimals} decimals.`;
  else if (gt(units, ctx.ceiling)) errors.price = 'Your price is above the listing’s ceiling.';
  const text = proposal.trim();
  const problem = lengthError(text, 'Your proposal', LIMITS.proposal.min, LIMITS.proposal.max);
  if (problem) errors.proposal = problem;
  if (errors.price || errors.proposal || units === null) return {errors, body: null};
  return {errors, body: {priceBaseUnits: units, proposal: text}};
}

export function validateReason(reason: string): string | null {
  return lengthError(reason.trim(), 'The reason', LIMITS.reason.min, LIMITS.reason.max) ?? null;
}

// ─── the idempotency key ────────────────────────────────────────────────────

/**
 * POST /v1/listings takes an Idempotency-Key: the same key and body is a
 * replay (200, no second listing); the same key with a different body is a
 * 409. So a key belongs to one DRAFT, not to one click:
 *
 * - it is made once, when the draft starts, and reused on every retry, so a
 *   double click or a dropped connection cannot post two listings;
 * - if the API REFUSED the last send (a 4xx: nothing was created), a changed
 *   body is a new attempt and gets a new key;
 * - if the last send's outcome is unknown (network down, 5xx), the key is
 *   kept: it might have been posted, and the API will say so.
 */
export interface KeyState {
  key: string;
  lastBody: string | null;
  outcome: 'rejected' | 'uncertain' | null;
}

export const newKeyState = (fresh: () => string): KeyState => ({key: fresh(), lastBody: null, outcome: null});

export function keyForSend(state: KeyState, bodyJson: string, fresh: () => string): KeyState {
  if (state.outcome === 'rejected' && state.lastBody !== null && state.lastBody !== bodyJson) {
    return {key: fresh(), lastBody: bodyJson, outcome: null};
  }
  return {...state, lastBody: bodyJson};
}

export function classifyFailure(err: unknown): 'rejected' | 'uncertain' {
  return err instanceof ApiError && err.status !== undefined && err.status >= 400 && err.status < 500
    ? 'rejected'
    : 'uncertain';
}
