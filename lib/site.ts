/**
 * Who runs Pactora, how to reach them, and which pages are public.
 *
 * Three facts the owner has not published yet come from public env vars, so
 * the site fills them in once they are set and says so plainly until then:
 *
 * | Variable                    | Unset                                               |
 * | --------------------------- | --------------------------------------------------- |
 * | `NEXT_PUBLIC_CONTACT_EMAIL` | "Email address coming soon — use GitHub meanwhile"  |
 * | `NEXT_PUBLIC_X_HANDLE`      | no X link anywhere                                  |
 * | `NEXT_PUBLIC_OPERATOR_NAME` | "the Pactora operator ([name to be confirmed])"     |
 *
 * They are compiled into the client bundle, like every NEXT_PUBLIC_ value, so
 * none may hold a secret. A value that is not an email or an X handle is
 * ignored rather than linked.
 */

export const EMAIL_FALLBACK = 'Email address coming soon — use GitHub meanwhile';
export const OPERATOR_FALLBACK = 'the Pactora operator ([name to be confirmed])';

export interface Site {
  contactEmail: string | null;
  x: {handle: string; url: string} | null;
  operatorName: string | null;
}

type Env = Partial<Record<string, string | undefined>>;

const clean = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function readSite(env: Env): Site {
  const email = clean(env['NEXT_PUBLIC_CONTACT_EMAIL']);
  const handle = clean(env['NEXT_PUBLIC_X_HANDLE'])?.replace(/^@/, '') ?? null;
  return {
    contactEmail: email && /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(email) ? email : null,
    // X handles: letters, digits and underscores, at most 15.
    x: handle && /^\w{1,15}$/.test(handle) ? {handle, url: `https://x.com/${handle}`} : null,
    operatorName: clean(env['NEXT_PUBLIC_OPERATOR_NAME']),
  };
}

/** The operator's name, or the visible placeholder. */
export function operatorName(site: Site): string {
  return site.operatorName ?? OPERATOR_FALLBACK;
}

// Each variable is read by name, so Next can inline it at build time.
export const SITE: Site = readSite({
  NEXT_PUBLIC_CONTACT_EMAIL: process.env['NEXT_PUBLIC_CONTACT_EMAIL'],
  NEXT_PUBLIC_X_HANDLE: process.env['NEXT_PUBLIC_X_HANDLE'],
  NEXT_PUBLIC_OPERATOR_NAME: process.env['NEXT_PUBLIC_OPERATOR_NAME'],
});

/** The four source repositories. */
export const REPOS = {
  contracts: 'https://github.com/gopaltalaviya/pactora-contracts-near',
  backend: 'https://github.com/gopaltalaviya/pactora-backend-near',
  interface: 'https://github.com/gopaltalaviya/pactora-interface-near',
  docs: 'https://github.com/gopaltalaviya/pactora-docs-near',
} as const;

/** This site's own origin, for absolute links (sitemap, robots, Open Graph). Never a hard-coded domain. */
export function siteUrl(): string {
  return (process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Every page a visitor can reach without an id, for the sitemap.
 * lib/seo.test.ts fails if this list and app/ disagree.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/demo',
  '/agents',
  '/register',
  '/signin',
  '/join',
  '/runs',
  '/status',
  '/about',
  '/fees',
  '/risks',
  '/contact',
  '/terms',
  '/privacy',
  '/docs',
  '/docs/quickstart',
  '/docs/concepts',
  '/docs/guides',
  '/docs/build-an-agent',
  '/docs/mcp',
  '/docs/api',
  '/docs/security',
  '/docs/faq',
] as const;
