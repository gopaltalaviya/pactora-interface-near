import {ApiError} from './api';

/**
 * An error, as a page shows it.
 *
 * The API answers a refusal with a code and a detail written for whoever
 * built the client (`FORBIDDEN: only the client may approve`). A person
 * never sees the code. What they read depends on where it happened:
 *
 * - `page`: a whole page could not load. The common refusals become one
 *   sentence each (a 403 is "you do not have access", a 404 "not found"),
 *   because the detail names an API resource, not a page.
 * - `action`: something the person just did was refused. The API's own
 *   words are kept ("that is not the code", "the daily allowance cannot
 *   reserve…"): they say what to change.
 *
 * Either way the view says whether trying again could help: only a network
 * failure or a 5xx; a 403 or a 404 answers the same way every time.
 */

export interface ErrorView {
  /** One sentence, fit to show. */
  text: string;
  /** The API did not answer, or failed: asking again may work. */
  retryable: boolean;
  /** The thing asked for does not exist (a 404): offer a way back, not a retry. */
  notFound: boolean;
}

const PAGE_SENTENCES: Record<string, string> = {
  FORBIDDEN: 'You do not have access to this page.',
  NOT_FOUND: 'This was not found. It may have been removed, or the link may be wrong.',
  UNAUTHORIZED: 'Sign in to see this.',
  RATE_LIMITED: 'Too many requests from your connection just now. Wait a moment and try again.',
};

/**
 * Codes whose detail is written for a developer, said in plain words for an
 * action too (the live audit of 2026-11-09 saw "RATE_LIMITED: Rate limit
 * exceeded, retry in 2 seconds" on /register). `retryAfter` is appended in
 * words when the API gave one.
 */
const ACTION_SENTENCES: Record<string, (err: ApiError) => string> = {
  RATE_LIMITED: (err) =>
    `Too many requests from your connection just now.${
      err.retryAfter ? ` Pactora asks for a wait of ${err.retryAfter} s.` : ' Wait a moment and try again.'
    }`,
};

export function describeError(err: unknown, scope: 'page' | 'action' = 'page'): ErrorView {
  if (err instanceof ApiError) {
    return {
      text:
        (scope === 'page' ? PAGE_SENTENCES[err.code] : undefined) ??
        ACTION_SENTENCES[err.code]?.(err) ??
        err.message,
      retryable: err.status === undefined || err.status >= 500 || err.status === 429,
      notFound: err.code === 'NOT_FOUND',
    };
  }
  if (err instanceof Error) return {text: err.message, retryable: true, notFound: false};
  return {text: 'something went wrong', retryable: true, notFound: false};
}

/** The sentence alone, for something the person just did: the API's words, never its code. */
export const errorText = (err: unknown): string => describeError(err, 'action').text;
