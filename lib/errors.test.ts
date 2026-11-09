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

  it('errorText is the sentence alone, for an action, and never carries the code', () => {
    expect(errorText(new ApiError('INSUFFICIENT_FUNDS', 'the daily allowance cannot reserve it', 402))).toBe(
      'the daily allowance cannot reserve it',
    );
    expect(errorText(new ApiError('FORBIDDEN', 'that is not the code', 403))).toBe('that is not the code');
    expect(errorText(new Error('plain'))).toBe('plain');
  });
});
