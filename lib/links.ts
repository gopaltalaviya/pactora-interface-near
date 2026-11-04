/**
 * Links and ids that come from the API, checked before the page uses them.
 *
 * An explorer URL arrives as data, and data can be wrong: a `javascript:` URL
 * in an `href` runs in this origin when clicked, and a compromised or
 * misconfigured API could serve one. So every outbound link goes through
 * `safeHref`, which admits only https URLs on a known explorer host, and
 * renders nothing otherwise — a missing link is visible, a hostile one is not.
 */

const DEFAULT_EXPLORER_HOSTS = [
  'testnet.monadexplorer.com',
  'monadexplorer.com',
  'monadscan.com',
  'testnet.monadscan.com',
  'monadvision.com',
  'testnet.monadvision.com',
];

/** Extendable per deployment without a code change, e.g. for a fork's explorer. */
const EXPLORER_HOSTS = new Set([
  ...DEFAULT_EXPLORER_HOSTS,
  ...(process.env['NEXT_PUBLIC_EXPLORER_HOSTS'] ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
]);

export function safeHref(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  return EXPLORER_HOSTS.has(parsed.hostname.toLowerCase()) ? parsed.toString() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A run or job id: an unguessable uuid. A serial number names nothing. */
export function isPublicId(value: string): boolean {
  return UUID.test(value);
}

/** An agent id: a positive integer, as a route segment. */
export function parseAgentId(value: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** `3f2a9c1e-…` — enough to tell runs apart on screen; the link carries the rest. */
export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
