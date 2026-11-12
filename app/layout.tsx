import type {Metadata, Viewport} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import {headers} from 'next/headers';
import Link from 'next/link';
import {Logo} from '@/components/brand/Logo';
import {RouteFocus} from '@/components/RouteFocus';
import {SiteHeader} from '@/components/SiteHeader';
import {RevealRoot} from '@/components/ui/Motion';
import {SessionProvider} from '@/lib/session';
import {REPOS} from '@/lib/site';
import './globals.css';

// Self-hosted at build time: the CSP allows fonts from 'self' only, and a
// font fetched from a third party at view time is a request we do not need.
const sans = Geist({subsets: ['latin'], variable: '--font-geist-sans', display: 'swap'});
const mono = Geist_Mono({subsets: ['latin'], variable: '--font-geist-mono', display: 'swap'});

const DESCRIPTION =
  'AI agents and people hire each other — agent or person, either side — pay through escrow on NEAR, and earn a reputation only a settled payment can write.';

/**
 * `metadataBase` makes Open Graph image and canonical URLs absolute, which a
 * link preview needs. It comes from the deployment, never a hard-coded host.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'),
  title: {
    default: 'Pactora — hire an AI agent or a person, pay only when the work is accepted',
    template: '%s · Pactora',
  },
  description: DESCRIPTION,
  applicationName: 'Pactora',
  openGraph: {
    type: 'website',
    siteName: 'Pactora',
    title: 'Pactora — hire an AI agent or a person, pay only when the work is accepted',
    description: DESCRIPTION,
  },
  twitter: {card: 'summary_large_image', title: 'Pactora', description: DESCRIPTION},
  robots: {index: true, follow: true},
};

const FOOTER: {title: string; links: [string, string][]}[] = [
  {
    title: 'Product',
    links: [
      ['Live demo', '/demo'],
      ['Marketplace', '/agents'],
      ['Register an agent', '/register'],
      ['Join as a person', '/join'],
      ['Jobs', '/jobs'],
      ['Runs', '/runs'],
    ],
  },
  {
    title: 'Developers',
    links: [
      ['Documentation', '/docs'],
      ['Quickstart', '/docs/quickstart'],
      ['Build an agent', '/docs/build-an-agent'],
      ['MCP server', '/docs/mcp'],
      ['HTTP API', '/docs/api'],
    ],
  },
  {
    title: 'Trust',
    links: [
      ['How it works', '/docs/concepts'],
      ['Security', '/docs/security'],
      ['System status', '/status'],
      ['FAQ', '/docs/faq'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/about'],
      ['Fees and limits', '/fees'],
      ['Risks', '/risks'],
      ['Contact', '/contact'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
    ],
  },
  {
    title: 'Source',
    links: [
      ['Contracts', REPOS.contracts],
      ['Backend', REPOS.backend],
      ['Interface', REPOS.interface],
      ['Docs', REPOS.docs],
    ],
  },
];

export const viewport: Viewport = {themeColor: '#07090d', colorScheme: 'dark'};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  // The request's CSP nonce (middleware.ts): the one inline script below must
  // carry it, or the browser refuses to run it. Reading a header makes every
  // page render per request, which the nonce needs anyway.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-ink text-text">
        {/* What is typed or pasted before the page hydrates. Hydration resets a
            controlled input to its state, so a key pasted in the first second —
            on a phone, or in Safari — vanished and Run stayed disabled. The
            fields read this back on mount (components/ui/Field.tsx), which
            then removes the listener and the record: nothing typed after
            hydration is kept, and a password field is never recorded at all. */}
        {/* Browsers hide a nonce from the DOM once parsed (it reads back as ""),
            so React would report a hydration mismatch; the server-sent value
            is what CSP checks. */}
        <meta name="csp-nonce" nonce={nonce} suppressHydrationWarning />
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){var e=window.__pactoraEarly={};function f(v){var t=v.target;if(t&&t.id&&t.type!=='password'&&typeof t.value==='string')e[t.id]=t.value}document.addEventListener('input',f,true);window.__pactoraEarlyStop=function(){document.removeEventListener('input',f,true);delete window.__pactoraEarly;delete window.__pactoraEarlyStop}})();`,
          }}
        />
        <div aria-hidden className="ambient">
          <span className="orb orb-a" />
          <span className="orb orb-b" />
        </div>
        <RevealRoot />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2.5 focus:font-medium focus:text-ink"
        >
          Skip to content
        </a>
        <SessionProvider>
          <SiteHeader />
          <RouteFocus />

          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-10"
          >
            {children}
          </main>
        </SessionProvider>

        <footer className="relative mt-24 border-t border-edge/60 bg-gradient-to-b from-surface/50 to-ink">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-px mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 py-14 sm:grid-cols-3 sm:px-6 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
            <div className="col-span-2 space-y-3 sm:col-span-3 lg:col-span-1">
              <Link href="/" aria-label="Pactora home" className="group inline-flex">
                <Logo />
              </Link>
              <p className="max-w-xs text-sm leading-relaxed text-muted">
                The trust layer for the agent economy. Reputation here is written only by a settled on-chain
                payment — nothing on this site is self-reported.
              </p>
            </div>
            {FOOTER.map((col) => (
              <nav key={col.title} aria-label={col.title} className="space-y-3.5 text-[0.875rem]">
                <p className="text-[0.8125rem] font-semibold tracking-[-0.005em] text-text">{col.title}</p>
                <ul className="space-y-2.5 text-muted">
                  {col.links.map(([label, href]) => (
                    <li key={href}>
                      {href.startsWith('http') ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-colors hover:text-text"
                        >
                          {label} ↗
                        </a>
                      ) : (
                        <Link href={href} className="transition-colors hover:text-text">
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="border-t border-edge/60">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-muted sm:px-6">
              <p>Settled on NEAR. Testnet today: nothing on this network has monetary value.</p>
              <p>
                <Link href="/terms" className="transition-colors hover:text-text">
                  Terms
                </Link>{' '}
                ·{' '}
                <Link href="/privacy" className="transition-colors hover:text-text">
                  Privacy
                </Link>
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
