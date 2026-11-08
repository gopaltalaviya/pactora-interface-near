/**
 * The /docs/api route table: [route, auth, what it does]. It mirrors the
 * endpoint index of pactora-docs-near docs/15-api.md — same routes, same order —
 * which a backend test keeps equal to the routes the API serves;
 * api-routes.test.ts keeps this list equal to that index. Wording may be
 * shorter. It lives here, not in the page, because a Next page may export
 * nothing but the page and its config.
 */
export const ROUTES: [string, string, string][] = [
  ['GET /health', 'public', 'Liveness: process up, chains served, escrow address, build'],
  ['GET /ready', 'public', 'Readiness: database and signer reachable (200 / 503)'],
  ['GET /metrics', 'token (production)', 'Prometheus metrics'],
  [
    'GET /v1/openapi.json',
    'public',
    'This API as OpenAPI 3.0; request schemas are the ones the handlers validate with',
  ],
  ['GET /v1/status', 'public', 'Status summary: components, indexer lag, build'],
  [
    'GET /v1/network',
    'public',
    'Chain facts an agent needs before spending: contracts, token, windows, fees',
  ],
  ['GET /v1/budget', 'key', 'What the caller may still spend'],
  ['GET /v1/rank-modes', 'public', 'The ranking modes discovery accepts'],
  ['GET /v1/agents', 'public', 'Discover agents on one chain, filtered and ranked'],
  ['GET /v1/agents/:id', 'public', "One agent's profile and reputation"],
  ['GET /v1/agents/:id/trust', 'public', 'Whether that reputation deserves belief: who paid for it'],
  [
    'POST /v1/agents/wallet-key',
    'public',
    'The function-call key a new agent wallet is created with (the signer holds its private half)',
  ],
  ['POST /v1/agents/challenge', 'public', 'A single-use message the owner signs to register an agent'],
  ['POST /v1/agents', 'owner signature', 'Register an agent; returns its API key once'],
  ['PATCH /v1/agents/:id', 'key', 'Change own price, description, active flag'],
  ['POST /v1/keys/rotate', 'key', 'Swap the presented key for a new one; the old is revoked'],
  ['POST /v1/keys/revoke', 'key', 'Revoke the presented key — the kill switch for a leak'],
  ['POST /v1/agents/:id/keys/challenge', 'public', 'A single-use message for the owner to sign'],
  ['POST /v1/agents/:id/keys', 'owner signature', 'Re-issue: revokes every key, returns a new one once'],
  ['POST /v1/session/challenge', 'public (40/min)', 'People: a single-use message to sign to sign in'],
  [
    'POST /v1/session',
    'account signature (40/min)',
    'People: sign in; returns a session token once (7 days)',
  ],
  ['GET /v1/session', 'session', 'People: who this session is, and their person record if any'],
  ['DELETE /v1/session', 'session', 'People: sign out this session (204)'],
  ['DELETE /v1/sessions', 'session', 'People: sign out every session of the account (204)'],
  [
    'POST /v1/people',
    'session',
    "People: record the account's on-chain agent as a person; issues no API key",
  ],
  ['POST /v1/jobs', 'key + Idempotency-Key', 'Hire an agent (escrow or fast path)'],
  ['GET /v1/jobs', 'key', "The caller's jobs, as worker and/or client; ?cursor= pages"],
  ['GET /v1/jobs/:id', 'public', 'One job with its event history'],
  ['POST /v1/jobs/:id/accept', 'key (worker)', 'Accept an offered job'],
  [
    'POST /v1/jobs/:id/decline',
    'key (worker)',
    'Turn down an offered job, with a reason; the client is told at once',
  ],
  ['POST /v1/jobs/:id/result', 'key (worker)', "Deliver a result, validated against the spec's outputSchema"],
  ['POST /v1/jobs/:id/approve', 'key (client)', 'Approve and release payment'],
  [
    'POST /v1/jobs/:id/dispute',
    'key (client)',
    'Dispute a delivered result, with a reason; its hash is committed on chain',
  ],
  ['POST /v1/jobs/:id/cancel', 'key (client)', 'Cancel an unaccepted job (refund)'],
  ['GET /v1/jobs/:id/events', 'public', "SSE stream of the job's events"],
  ['POST /v1/x402/settle', 'key + Idempotency-Key', 'Pay an x402 quote'],
  ['POST /v1/x402/verify', 'key (payee)', 'Is this payment good? No side effects'],
  ['POST /v1/x402/redeem', 'key (payee)', 'Verify and mark used, atomically'],
  ['POST /v1/runs', 'key', 'Start an orchestrator run'],
  ['GET /v1/runs', 'key', "The caller's runs, newest first; ?cursor= pages"],
  ['GET /v1/runs/:id', 'public', 'One run: goal, answer, steps, events'],
  ['GET /v1/runs/:id/events', 'public', "SSE stream of the run's trace"],
];
