/**
 * An agent's credentials and record, for its owner (2026-11-09, item 9 and
 * the audit's missing features): API-key re-issue by the owner's signature
 * (routes/keys.ts), rotate and revoke by the key itself, the agent's own
 * record (PATCH /v1/agents/:id) and its webhooks. Types follow the backend.
 */

import {ApiError, api, request, type AgentSummary, type Challenge} from './api';

const json = (extra: Record<string, string> = {}) => ({'content-type': 'application/json', ...extra});
const key = (apiKey: string) => ({authorization: `Bearer ${apiKey}`});

export type Scope = 'read' | 'worker' | 'client' | 'full';
export const SCOPES: {value: Scope; what: string}[] = [
  {value: 'full', what: 'everything the agent may do'},
  {
    value: 'worker',
    what: 'accept, decline, deliver, drafts, messages, uploads; never hire, approve, dispute or post',
  },
  {value: 'client', what: 'hire, approve, dispute, post listings; never deliver'},
  {value: 'read', what: 'reads only; every write is refused'},
];

export interface IssuedKey {
  agentId: string;
  apiKey: string;
  keyId: string;
  revokedKeyId?: string;
  revokedKeys?: number;
  scopes?: Scope[];
  warning?: string;
}

/** routes/webhooks.ts hookView. `kinds` empty means every event kind. */
export interface Webhook {
  webhookId: string;
  url: string;
  kinds: string[];
  active: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  createdAt: string;
}

/** One delivery attempt series, newest first (GET /v1/webhooks/:id/deliveries). */
export interface Delivery {
  deliveryId: string;
  seq: number;
  /** pending (retrying), delivered or failed. */
  status: string;
  attempts: number;
  /** The receiver's last HTTP status, or null when it never answered. */
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
}

/** PATCH /v1/agents/:id answers these fields only (`name` since 2026-11-10). */
export interface PatchedAgent {
  agentId: number | string;
  name?: string;
  pricePerTask: string;
  active: boolean;
}

const KIND = /^[a-z][a-z0-9_.]{0,63}$/;

/** Event kinds typed as "job.settled, job.message": [] (every kind) when empty, or a problem. */
export function parseKinds(text: string): {kinds: string[]; problem: string | null} {
  const kinds = [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
  const bad = kinds.find((k) => !KIND.test(k));
  if (bad) return {kinds: [], problem: `“${bad}” is not an event kind (like job.message).`};
  if (kinds.length > 50) return {kinds: [], problem: 'At most 50 event kinds.'};
  return {kinds, problem: null};
}

/** One delivery, in words: "#2 · pending · 2 attempts · last answer 503 · HTTP 503 · next attempt …". */
export function deliveryLine(d: Delivery, when: (iso: string) => string): string {
  const parts = [`#${d.seq}`, d.status, `${d.attempts} attempt${d.attempts === 1 ? '' : 's'}`];
  parts.push(d.lastStatus === null ? 'no answer yet' : `last answer ${d.lastStatus}`);
  if (d.lastError) parts.push(d.lastError);
  if (d.deliveredAt) parts.push(`delivered ${when(d.deliveredAt)}`);
  else if (d.nextAttemptAt) parts.push(`next attempt ${when(d.nextAttemptAt)}`);
  return parts.join(' · ');
}

/**
 * What a saved record says, from the API's reply: the name it confirms, never
 * "undefined" (an API before 2026-11-10 did not return the name).
 */
export function savedSummary(
  reply: PatchedAgent,
  sentName: string | undefined,
  price: (base: string) => string,
): string {
  const named = reply.name
    ? `Now named ${reply.name}`
    : sentName
      ? `Saved, but the API did not confirm the name “${sentName}”: reload the profile to check it`
      : 'Saved';
  return `${named}; ${price(reply.pricePerTask)} a task; ${reply.active ? 'accepting work' : 'not accepting work'}.`;
}

const API_KEY = /^ax_[A-Za-z0-9]+_[A-Za-z0-9]+$/;

/** A problem with a typed API key, or null. */
export function validateApiKey(k: string): string | null {
  const t = k.trim();
  if (!t) return 'Paste the agent’s current API key.';
  if (!API_KEY.test(t)) return 'An API key reads ax_<keyId>_<secret>.';
  return null;
}

export const keys = {
  /** Start a re-issue: a message for the owner to sign (NEP-413). Needs no credentials. */
  challenge: (agentId: string) =>
    request<Challenge>(
      `/v1/agents/${encodeURIComponent(agentId)}/keys/challenge`,
      {method: 'POST', headers: json(), body: '{}'},
      'could not start the re-issue',
    ),

  /** Re-issue: revokes every key of the agent, returns the new one once. */
  reissue: (agentId: string, body: {publicKey: string; signature: string; nonce: string}) =>
    request<IssuedKey>(
      `/v1/agents/${encodeURIComponent(agentId)}/keys`,
      {method: 'POST', headers: json(), body: JSON.stringify(body)},
      'could not re-issue the key',
    ),

  /** Swap the presented key for a new one; the old one is revoked at once. */
  rotate: (apiKey: string, scopes?: Scope[]) =>
    request<IssuedKey>(
      '/v1/keys/rotate',
      {method: 'POST', headers: json(key(apiKey)), body: JSON.stringify(scopes ? {scopes} : {})},
      'could not rotate the key',
    ),

  /** The kill switch: revoke the presented key. */
  revoke: (apiKey: string) =>
    request<{agentId: string; revokedKeyId: string}>(
      '/v1/keys/revoke',
      {method: 'POST', headers: key(apiKey)},
      'could not revoke the key',
    ),

  /** The agent's own record: name, description, price, active. An empty patch is refused by the API. */
  patchAgent: (
    apiKey: string,
    agentId: string,
    patch: Partial<Pick<AgentSummary, 'name' | 'description' | 'pricePerTask' | 'active'>>,
  ) => {
    if (Object.keys(patch).length === 0) throw new ApiError('SCHEMA_MISMATCH', 'Nothing changed.', 422);
    return request<PatchedAgent>(
      `/v1/agents/${encodeURIComponent(agentId)}`,
      {method: 'PATCH', headers: json(key(apiKey)), body: JSON.stringify(patch)},
      'could not change the agent',
    );
  },

  webhooks: (apiKey: string) =>
    request<{webhooks: Webhook[]}>('/v1/webhooks', {headers: key(apiKey)}, 'could not load the webhooks'),
  /** `kinds` empty or omitted: every event kind. */
  addWebhook: (apiKey: string, url: string, kinds?: string[]) =>
    request<Webhook & {secret: string}>(
      '/v1/webhooks',
      {
        method: 'POST',
        headers: json(key(apiKey)),
        body: JSON.stringify({url, ...(kinds && kinds.length > 0 ? {kinds} : {})}),
      },
      'could not add the webhook',
    ),
  deleteWebhook: (apiKey: string, id: string) =>
    request<{webhookId: string; deleted: boolean}>(
      `/v1/webhooks/${encodeURIComponent(id)}`,
      {method: 'DELETE', headers: key(apiKey)},
      'could not delete it',
    ),
  deliveries: (apiKey: string, id: string) =>
    request<{webhookId: string; deliveries: Delivery[]}>(
      `/v1/webhooks/${encodeURIComponent(id)}/deliveries`,
      {headers: key(apiKey)},
      'could not load the deliveries',
    ),
  rotateWebhook: (apiKey: string, id: string) =>
    request<Webhook & {secret: string}>(
      `/v1/webhooks/${encodeURIComponent(id)}/rotate`,
      {method: 'POST', headers: key(apiKey)},
      'could not rotate the secret',
    ),
};

export {api};
