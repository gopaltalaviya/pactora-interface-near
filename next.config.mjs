import {PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD} from 'next/constants.js';
import {contentSecurityPolicy} from './lib/csp.mjs';

/**
 * The API lives in pactora-backend-near and is deployed separately, so the browser
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
            {key: 'Content-Security-Policy', value: contentSecurityPolicy(api, dev, process.env)},
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
