/**
 * `/signin?next=…`: where to go once signed in.
 *
 * Only a path on this site is honoured — one that starts with a single `/`,
 * followed by anything but another slash or a backslash — so the parameter
 * can never send a person to another origin (`//host`, `https://…`), and a
 * browser's lenient reading of `/\host` cannot either. The sign-in page
 * itself is never a destination (it would loop).
 */

const PATH = /^\/(?![/\\])[^\s\\]*$/;

/** The path if it is safe to navigate to, else `null`. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !PATH.test(value)) return null;
  if (/^\/%2F/i.test(value)) return null;
  if (value === '/signin' || value.startsWith('/signin?') || value.startsWith('/signin#')) return null;
  return value;
}

/** The sign-in link that brings a person back to `current` (a path and query), when that is safe. */
export function signInHref(current: string | null | undefined): string {
  const next = safeNext(current);
  return next ? `/signin?next=${encodeURIComponent(next)}` : '/signin';
}
