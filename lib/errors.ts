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
  /** Where the person fixes it, when a page can help (a contract refusal about money). */
  next?: {href: string; label: string};
}

const MONEY: ErrorView['next'] = {href: '/me#money', label: 'See your money'};

/**
 * The contract's refusals about money and time (pactora-contracts-near
 * errors.rs), by their stable names. They reach the page two ways, and both
 * carry the name: from the wallet, as the outcome's "Smart contract
 * panicked: <Name>"; from the API's signer, as "the contract refused: <Name>
 * (transaction …, nothing changed)" under INSUFFICIENT_FUNDS,
 * BUDGET_EXCEEDED, AGENT_NOT_HIREABLE or DEADLINE_PASSED. A reverted call
 * moves no tokens, so each sentence says so and what to do next.
 */
const CONTRACT_SENTENCES: Record<string, {text: string; next?: ErrorView['next']}> = {
  InsufficientBalance: {
    text: 'Your purse does not hold enough for this, so the contract refused it and no money moved. Fund your purse, then try again.',
    next: MONEY,
  },
  PerTaskCapExceeded: {
    text: 'This is above your per-task spending cap, so the contract refused it and no money moved. Raise the cap on your manage page, or use a lower amount.',
    next: MONEY,
  },
  DailyCapExceeded: {
    text: 'This goes past what your daily cap allows in the current 24 hours, so the contract refused it and no money moved. Wait for earlier spending to roll off, or raise your daily cap.',
    next: MONEY,
  },
  InsufficientStorage: {
    text: 'Your record has too little NEAR for storage to hold another job, so the contract refused it and no money moved. Add storage on your manage page, then try again.',
    next: MONEY,
  },
  InsufficientBond: {
    text: 'Your unlocked stake does not cover the bond this needs, so the contract refused it and no money moved. Add stake, then try again.',
    next: MONEY,
  },
  DeadlinePassed: {
    text: 'The deadline for this step has passed, so the contract refused it and nothing changed. The job now ends by its timeout: Pactora’s keeper closes it on chain.',
  },
  NotHireable: {
    text: 'The worker cannot be hired right now (its stake is below the network minimum, or it has no accepted wallet, or it is frozen), so the contract refused it and no money moved. Choose another worker, or ask its owner to fix it.',
    next: {href: '/agents', label: 'Browse agents'},
  },
};

const PANIC = new RegExp(`\\b(${Object.keys(CONTRACT_SENTENCES).join('|')})\\b`);

/**
 * The faucet's refusals (pactora-backend-near apps/api/src/routes/faucet.ts):
 * three LIMIT_REACHED details, the testnet-only FORBIDDEN, and a server with
 * no faucet set up (UPSTREAM_UNAVAILABLE, whose detail `request` keeps).
 */
function faucetSentence(err: ApiError): {text: string; retryable: boolean} | null {
  const detail = `${err.message} ${err.detail ?? ''}`;
  if (err.code === 'LIMIT_REACHED') {
    if (/already claimed today/.test(detail))
      return {
        text: 'You have already claimed test tokens today. You can claim again after midnight UTC.',
        retryable: false,
      };
    if (/claims per address per day/.test(detail))
      return {
        text: 'Your internet address has made as many faucet claims as it may today. Try again after midnight UTC.',
        retryable: false,
      };
    if (/given out all it may today/.test(detail))
      return {
        text: 'The faucet has given out all it may today. Try again after midnight UTC.',
        retryable: false,
      };
  }
  if (err.code === 'UPSTREAM_UNAVAILABLE' && /no faucet is configured/.test(detail))
    return {
      text: 'This server has no test-token faucet set up, so it cannot send you tokens. Ask whoever runs it, or get test tokens from someone who has some.',
      retryable: false,
    };
  if (err.code === 'FORBIDDEN' && /faucet exists on testnet only/.test(detail))
    return {
      text: 'The faucet runs on testnet only: real tokens are never given away.',
      retryable: false,
    };
  return null;
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
  const panic = err instanceof Error ? PANIC.exec(err.message)?.[1] : undefined;
  if (panic) {
    const s = CONTRACT_SENTENCES[panic]!;
    return {text: s.text, retryable: false, notFound: false, ...(s.next ? {next: s.next} : {})};
  }
  if (err instanceof ApiError) {
    const faucet = faucetSentence(err);
    if (faucet) return {text: faucet.text, retryable: faucet.retryable, notFound: false};
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
