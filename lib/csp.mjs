/**
 * Content Security Policy, built here so a test can read it (middleware.ts
 * applies it, with a nonce made for each request).
 *
 * `connect-src` is the one that matters: the page fetches the API, streams
 * run events from it, and — on /register only — the NEAR wallet talks to the
 * chain. Everything else is same-origin.
 *
 * ## The wallet
 *
 * NEAR Connect (lib/wallet.ts) fetches a wallet manifest and each wallet's
 * code, then runs that code in a sandboxed `srcdoc` iframe, which INHERITS
 * this policy. So the wallet code's own requests are bound by it too. The
 * defaults below are the hosts the testnet-capable wallets' code names,
 * read from the manifest and the executors on 2026-11-05 — not every wallet
 * has been tried live. A deployment that needs another sets
 * `NEXT_PUBLIC_WALLET_ORIGINS` (space- or comma-separated; replaces the list).
 *
 * - raw.githubusercontent.com, cdn.jsdelivr.net: the manifest and most wallet code.
 * - wallet.intear.tech (+ its logout bridge): Intear's code and session.
 * - wallet.meteorwallet.app, mc.meteorwallet.app: Meteor.
 * - test.rpc.fastnear.com, api.testnet.fastnear.com: the testnet RPC and
 *   account API several wallets use instead of ours.
 *
 * Some wallet code (Meteor, Nightly) contains `new Function`; production
 * keeps 'unsafe-eval' OFF regardless, and a wallet that needs it fails
 * visibly rather than weakening the whole site.
 *
 * `img-src https:` is for the wallet icons the picker shows, served from each
 * wallet's own host.
 *
 * ## Scripts
 *
 * `script-src` is nonce-based since 2026-11-09: middleware.ts makes a nonce
 * per request, Next puts it on every script it inlines (its hydration data)
 * and on its chunk tags, the root layout puts it on the one inline script of
 * its own, and NEAR Connect is given it for the wallet iframe's inline code
 * (`cspNonce`). `'strict-dynamic'` lets a nonced script load the chunks it
 * needs; nothing without the nonce runs. The price is that every page is
 * rendered per request (the nonce is in the HTML); the gain is that an
 * injected `<script>` — from a compromised dependency, an API field that
 * slipped past React, a browser extension writing into the page — is inert.
 */

export const DEFAULT_RPC_ORIGINS = 'https://test.rpc.fastnear.com https://rpc.testnet.near.org';

export const DEFAULT_WALLET_ORIGINS = [
  'https://raw.githubusercontent.com',
  'https://cdn.jsdelivr.net',
  'https://wallet.intear.tech',
  'wss://logout-bridge-service.intear.tech',
  'https://wallet.meteorwallet.app',
  'https://mc.meteorwallet.app',
  'https://test.rpc.fastnear.com',
  'https://api.testnet.fastnear.com',
].join(' ');

/** @param {string} list */
const origins = (list) => list.split(/[\s,]+/).filter(Boolean);

/**
 * @param {string} api
 * @param {boolean} dev
 * @param {Record<string, string | undefined>} env
 * @param {string} nonce base64, from middleware.ts; one per request
 */
export function contentSecurityPolicy(api, dev, env, nonce) {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce ?? '')) throw new Error('a CSP nonce is required');
  const rpc = origins(env.NEXT_PUBLIC_RPC_ORIGINS ?? DEFAULT_RPC_ORIGINS);
  const wallet = origins(env.NEXT_PUBLIC_WALLET_ORIGINS ?? DEFAULT_WALLET_ORIGINS);
  const origin = new URL(api).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' ${[...new Set([origin, ...rpc, ...wallet])].join(' ')}${dev ? ' ws: http://127.0.0.1:* http://localhost:*' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
