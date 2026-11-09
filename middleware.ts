import {NextResponse, type NextRequest} from 'next/server';
import {contentSecurityPolicy} from './lib/csp.mjs';

/**
 * One nonce per request, for the Content-Security-Policy (lib/csp.mjs).
 *
 * The policy travels twice: on the REQUEST, where Next reads the nonce and
 * puts it on every script it inlines or loads (and `headers()` hands it to
 * the root layout for its own inline script); and on the RESPONSE, where the
 * browser enforces it. The other security headers stay in next.config.mjs:
 * they do not change per request.
 */

// Inlined at build time, like every NEXT_PUBLIC_ value; the fallback is the
// one next.config.mjs allows for `next dev` and the tests only.
const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:8080';
const DEV = process.env.NODE_ENV === 'development';
const ENV = {
  NEXT_PUBLIC_RPC_ORIGINS: process.env['NEXT_PUBLIC_RPC_ORIGINS'],
  NEXT_PUBLIC_WALLET_ORIGINS: process.env['NEXT_PUBLIC_WALLET_ORIGINS'],
};

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function middleware(request: NextRequest) {
  const nonce = makeNonce();
  const csp = contentSecurityPolicy(API, DEV, ENV, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({request: {headers: requestHeaders}});
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages and route handlers; not Next's static files, which carry no scripts to nonce.
      source: '/((?!_next/static|_next/image).*)',
      missing: [
        {type: 'header', key: 'next-router-prefetch'},
        {type: 'header', key: 'purpose', value: 'prefetch'},
      ],
    },
  ],
};
