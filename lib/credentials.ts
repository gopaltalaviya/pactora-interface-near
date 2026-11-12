/**
 * Work credentials (feature/work-credentials): soulbound NEP-171 tokens the
 * credentials contract issues to the worker of a settled Pactora job. The
 * token id is the job's chain id; the metadata's `extra` is canonical JSON
 * naming the job, the parties, the amount and its hashes.
 *
 * Read in the browser straight from a NEAR RPC node (`nft_tokens_for_owner`),
 * so what a page lists is what the chain holds — never the API's say-so.
 * Everything in a token is data from the chain: each field is checked for its
 * type before the page shows it, and a token that does not parse is still
 * listed with what it can say.
 */

import {safeHref} from './links';

/** NEP-171 `Token` with NEP-177 metadata, as `nft_tokens_for_owner` returns it. */
export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata: {
    title?: string | null;
    description?: string | null;
    media?: string | null;
    issued_at?: string | null;
    extra?: string | null;
  } | null;
}

/** One credential, as the pages show it. Null fields were missing or of the wrong type. */
export interface Credential {
  tokenId: string;
  title: string;
  chainJobId: string | null;
  client: string | null;
  worker: string | null;
  /** Base units of `token`. */
  amount: string | null;
  token: string | null;
  /** ISO time the job settled (or, failing that, the token was issued). */
  settledAt: string | null;
}

/** The most a page reads in one call; the contract pages the rest. */
export const CREDENTIALS_PAGE = 50;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * A time as an ISO string: an ISO time as is, or a count since 1970 in
 * seconds, milliseconds or nanoseconds (NEP-177 leaves `issued_at`'s unit to
 * the contract). Null for anything it cannot read.
 */
export function credentialDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return credentialDate(String(Math.trunc(value)));
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^\d+$/.test(value)) {
    // By size: < 1e11 seconds, < 1e14 milliseconds, else nanoseconds (BigInt keeps the digits).
    const n = BigInt(value);
    const ms = n < 100_000_000_000n ? n * 1000n : n < 100_000_000_000_000n ? n : n / 1_000_000n;
    const d = new Date(Number(ms));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(value) ? null : d.toISOString();
}

export function parseCredential(token: NftToken): Credential {
  const meta = token.metadata ?? {};
  let extra: Record<string, unknown> = {};
  try {
    const parsed: unknown = typeof meta.extra === 'string' ? JSON.parse(meta.extra) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      extra = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: list the token with its id and title alone.
  }
  return {
    tokenId: token.token_id,
    title: str(meta.title) ?? `Credential ${token.token_id}`,
    chainJobId: str(extra['chainJobId']),
    client: str(extra['client']),
    worker: str(extra['worker']),
    amount: typeof extra['amount'] === 'string' && /^\d+$/.test(extra['amount']) ? extra['amount'] : null,
    token: str(extra['token']),
    settledAt: credentialDate(extra['settledAt']) ?? credentialDate(meta.issued_at),
  };
}

/** The token's page on the block explorer (NearBlocks `/nft-token/<contract>/<id>`), if the explorer is known. */
export function tokenHref(
  explorer: string | null | undefined,
  contract: string,
  tokenId: string,
): string | null {
  if (!explorer) return null;
  return safeHref(
    `${explorer.replace(/\/$/, '')}/nft-token/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`,
  );
}
