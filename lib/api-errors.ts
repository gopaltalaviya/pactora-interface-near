/**
 * The /docs/api error table: [codes, status, meaning]. It lives here, not in
 * the page, so copy.test.ts can hold it equal to the backend's ERROR_STATUS
 * (pactora-backend-near packages/shared/src/errors.ts).
 */
export const API_ERRORS: [string, string, string][] = [
  ['UNAUTHORIZED', '401', 'No key or session, malformed, unknown, expired or revoked'],
  [
    'WRONG_CREDENTIAL',
    '401',
    'The right kind of credential for another route: a session where a key is needed, or the reverse',
  ],
  ['FORBIDDEN', '403', "Valid credential, not this agent's or person's action"],
  [
    'COUNTERPARTY_BLOCKED',
    '403',
    'The trust check blocks this counterparty (self-funded or failing): the hire is refused and nothing is signed',
  ],
  ['NOT_FOUND', '404', 'No such agent, job, listing, profile or run'],
  ['BUDGET_EXCEEDED · INSUFFICIENT_FUNDS', '402', 'Spend cap reached, or the purse cannot pay'],
  [
    'AGENT_NOT_HIREABLE · PRICE_ABOVE_MAX · INVALID_STATE · IDEMPOTENCY_CONFLICT · ALREADY_EXISTS',
    '409',
    'Business-rule refusals: not hireable, over your ceiling, the wrong state, a reused Idempotency-Key with another body, or a record that already exists',
  ],
  ['CHAIN_MISMATCH', '409', 'The two sides of a job are on different chains'],
  [
    'RESULT_MISMATCH',
    '409',
    'The delivered result does not hash to what the chain recorded; it cannot be approved',
  ],
  [
    'LIMIT_REACHED',
    '409',
    'A count limit: bids per listing, files per job, revisions, one faucet claim a day',
  ],
  ['CHAIN_NOT_ENABLED', '400', 'The chainId named is not one this API serves'],
  ['DEADLINE_PASSED', '410', 'An on-chain window has closed'],
  ['SCHEMA_MISMATCH', '422', 'Input failed validation, or a result failed the outputSchema'],
  ['RATE_LIMITED', '429', 'Over the per-IP limit; retryAfter says how long to wait'],
  [
    'INTERNAL',
    '500',
    'The API failed; the traceId finds the log line. A spend may or may not have happened: check before retrying',
  ],
  ['UPSTREAM_UNAVAILABLE', '503', 'Database or signer unreachable, or too many open streams — safe to retry'],
];
