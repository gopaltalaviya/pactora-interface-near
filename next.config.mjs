import {PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD} from 'next/constants.js';

/**
 * The API lives in agentx-backend and is deployed separately, so the browser
 * talks to it directly. Kept as one env var rather than scattered literals —
 * the same page has to work against localhost, a Railway URL and a judge's
 * fork without a rebuild of anything but this value.
 *
 * A production build without it FAILS. It used to fall back to
 * http://127.0.0.1:8080, which builds cleanly and ships a site that talks to
 * the visitor's own laptop: every page renders "API unreachable" and nothing
 * in the build log says why.
 */
function apiUrl(phase) {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) {
    if (phase === PHASE_PRODUCTION_BUILD) {
      throw new Error('NEXT_PUBLIC_API_URL is not set — a production build would talk to localhost');
    }
    return 'http://127.0.0.1:8080';
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`NEXT_PUBLIC_API_URL must be http(s): ${raw}`);
  }
  return raw.replace(/\/$/, '');
}

/**
 * Content Security Policy.
 *
 * `connect-src` is the one that matters: the page fetches the API, streams
 * run events from it, and — on /register only — reads a transaction receipt
 * from the chain's public RPC. Everything else is same-origin.
 *
 * `script-src` keeps 'unsafe-inline' because Next's App Router inlines its
 * hydration data. The alternative, a per-request nonce, makes every page
 * dynamically rendered; for a site that renders no user-supplied HTML (React
 * escapes all of it, and links pass `safeHref`) that trade is not worth it.
 */
function contentSecurityPolicy(api, dev) {
  const rpc = (
    process.env.NEXT_PUBLIC_RPC_ORIGINS ??
    'https://testnet-rpc.monad.xyz https://rpc.monad.xyz https://rpc1.monad.xyz https://rpc2.monad.xyz'
  )
    .split(/[\s,]+/)
    .filter(Boolean);
  const origin = new URL(api).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${origin} ${rpc.join(' ')}${dev ? ' ws: http://127.0.0.1:* http://localhost:*' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** @param {string} phase */
export default function config(phase) {
  const api = apiUrl(phase);
  const dev = phase === PHASE_DEVELOPMENT_SERVER;

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    env: {NEXT_PUBLIC_API_URL: api},
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            {key: 'Content-Security-Policy', value: contentSecurityPolicy(api, dev)},
            {key: 'X-Content-Type-Options', value: 'nosniff'},
            {key: 'X-Frame-Options', value: 'DENY'},
            {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
            {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()'},
            ...(dev
              ? []
              : [{key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains'}]),
          ],
        },
      ];
    },
  };
  return nextConfig;
}
