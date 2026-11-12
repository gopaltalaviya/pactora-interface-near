import {describe, expect, it} from 'vitest';
import {ApiError, UNREACHABLE} from './api';
import {describeError, errorText} from './errors';

/**
 * An API refusal reaches the page as a code and a detail written for a
 * developer. A person reads a sentence: what happened, and whether trying
 * again could help. The code itself is never shown.
 */
describe('describeError', () => {
  it('turns the common refusals of a page load into plain sentences, without the code', () => {
    const forbidden = describeError(new ApiError('FORBIDDEN', 'only the client may approve', 403));
    expect(forbidden.text).toBe('You do not have access to this page.');
    expect(forbidden.retryable).toBe(false);
    expect(forbidden.notFound).toBe(false);

    const missing = describeError(new ApiError('NOT_FOUND', 'no job abc', 404));
    expect(missing.text).toMatch(/not found/i);
    expect(missing.text).not.toMatch(/NOT_FOUND/);
    expect(missing.notFound).toBe(true);
    expect(missing.retryable).toBe(false);

    expect(describeError(new ApiError('UNAUTHORIZED', 'bad token', 401)).text).toBe('Sign in to see this.');
    expect(describeError(new ApiError('VALIDATION', 'bad token', 400)).text).not.toMatch(/^VALIDATION:/);
  });

  it('keeps the API’s own words for a refusal it has no sentence for, so nothing is hidden', () => {
    const out = describeError(
      new ApiError('INVALID_STATE', 'job is "settled", approve needs "submitted"', 409),
    );
    expect(out.text).toContain('job is "settled"');
    expect(out.retryable).toBe(false);
  });

  it('keeps the API’s words for something the person just did: they say what to change', () => {
    expect(describeError(new ApiError('FORBIDDEN', 'that is not the code', 403), 'action').text).toBe(
      'that is not the code',
    );
    expect(describeError(new ApiError('NOT_FOUND', 'no such proposal', 404), 'action').notFound).toBe(true);
  });

  it('marks a network failure or a 5xx as worth a retry', () => {
    expect(describeError(new ApiError('UNREACHABLE', UNREACHABLE)).retryable).toBe(true);
    expect(describeError(new ApiError('INTERNAL', 'The API had a problem (500).', 500)).retryable).toBe(true);
    expect(describeError(new TypeError('Failed to fetch')).retryable).toBe(true);
    expect(describeError('odd').text).toBe('something went wrong');
  });

  it('says a rate limit in plain words, with the wait the API asked for, and calls it worth a retry', () => {
    const limited = new ApiError('RATE_LIMITED', 'Rate limit exceeded, retry in 2 seconds', 429, 2);
    expect(errorText(limited)).toBe(
      'Too many requests from your connection just now. Pactora asks for a wait of 2 s.',
    );
    expect(errorText(limited)).not.toMatch(/RATE_LIMITED/);
    expect(describeError(limited, 'action').retryable).toBe(true);
    expect(describeError(limited).text).toMatch(/^Too many requests/);
  });

  it('errorText is the sentence alone, for an action, and never carries the code', () => {
    expect(errorText(new ApiError('INSUFFICIENT_FUNDS', 'the daily allowance cannot reserve it', 402))).toBe(
      'the daily allowance cannot reserve it',
    );
    expect(errorText(new ApiError('FORBIDDEN', 'that is not the code', 403))).toBe('that is not the code');
    expect(errorText(new Error('plain'))).toBe('plain');
  });
});

/**
 * 2026-11-12: the contract's refusals about money and time, however they
 * arrive (the wallet's outcome, or the API's signer), and the faucet's, in
 * plain words with the next step. None of these is worth a blind retry.
 */
describe('describeError: contract and faucet refusals', () => {
  const fromApi = (code: string, name: string) =>
    new ApiError(code, `the contract refused: ${name} (transaction 8Ha3T, nothing changed)`, 402);
  const fromWallet = (name: string) =>
    new Error(
      `create_job failed: {"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: ${name}"}}}}`,
    );

  it.each([
    ['InsufficientBalance', 'INSUFFICIENT_FUNDS', /purse does not hold enough.*Fund your purse/],
    ['DailyCapExceeded', 'BUDGET_EXCEEDED', /daily cap allows.*raise your daily cap/],
    ['PerTaskCapExceeded', 'BUDGET_EXCEEDED', /per-task spending cap.*Raise the cap/],
    ['InsufficientStorage', 'INSUFFICIENT_FUNDS', /too little NEAR for storage.*Add storage/],
    ['InsufficientBond', 'INSUFFICIENT_FUNDS', /unlocked stake does not cover the bond.*Add stake/],
    ['DeadlinePassed', 'DEADLINE_PASSED', /deadline for this step has passed.*keeper/],
    ['NotHireable', 'AGENT_NOT_HIREABLE', /cannot be hired right now.*Choose another worker/],
  ])('%s, from the API and from the wallet', (name, code, words) => {
    for (const err of [fromApi(code, name), fromWallet(name)]) {
      const out = describeError(err, 'action');
      expect(out.text).toMatch(words);
      expect(out.text).not.toContain(name);
      expect(out.text).not.toContain(code);
      expect(out.retryable).toBe(false);
    }
  });

  it('points a money refusal at the money panel', () => {
    expect(describeError(fromWallet('InsufficientBalance'), 'action').next).toEqual({
      href: '/me#money',
      label: 'See your money',
    });
    expect(describeError(fromWallet('DeadlinePassed'), 'action').next).toBeUndefined();
  });

  it('says each faucet limit in words', () => {
    const limit = (detail: string) => errorText(new ApiError('LIMIT_REACHED', detail, 409));
    expect(limit('ann.testnet already claimed today (UTC 2026-11-12)')).toBe(
      'You have already claimed test tokens today. You can claim again after midnight UTC.',
    );
    expect(limit('at most 3 claims per address per day')).toMatch(/internet address/);
    expect(limit('the faucet has given out all it may today; try tomorrow')).toBe(
      'The faucet has given out all it may today. Try again after midnight UTC.',
    );
    // Another LIMIT_REACHED keeps the API's words.
    expect(limit('at most 3 bids per listing')).toBe('at most 3 bids per listing');
  });

  it('says a server with no faucet, from the 503 detail request() keeps', () => {
    const none = new ApiError(
      'UPSTREAM_UNAVAILABLE',
      'Pactora is temporarily unavailable',
      undefined,
      undefined,
      'no faucet is configured on this server',
    );
    const out = describeError(none, 'action');
    expect(out.text).toMatch(/no test-token faucet set up/);
    expect(out.retryable).toBe(false);
    expect(
      errorText(
        new ApiError(
          'FORBIDDEN',
          'the faucet exists on testnet only — real tokens are never given away',
          403,
        ),
      ),
    ).toBe('The faucet runs on testnet only: real tokens are never given away.');
  });
});
