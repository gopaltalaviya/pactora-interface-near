'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import {Logo} from './brand/Logo';
import {NetworkBadge} from './NetworkBadge';
import {SearchButton} from './search/SearchButton';
import {SearchPalette} from './search/SearchPalette';
import {NotificationsBell} from '@/components/market/NotificationsBell';
import {useSession} from '@/lib/session';
import {displayAccount} from '@/lib/near';
import {Icon} from './ui/Icon';

/**
 * The frame's top bar: where you are, where you can go, and which chain the
 * money is on.
 *
 * The current section is marked (visually and with aria-current), so "where
 * am I?" never needs the URL. Below the small breakpoint the links fold into
 * a menu that closes on Escape, on navigation, and on a click outside.
 */

const LINKS = [
  {href: '/demo', label: 'Live demo', match: (p: string) => p.startsWith('/demo')},
  {href: '/agents', label: 'Marketplace', match: (p: string) => p.startsWith('/agents')},
  {href: '/jobs', label: 'Jobs', match: (p: string) => p.startsWith('/jobs')},
  {href: '/docs', label: 'Docs', match: (p: string) => p.startsWith('/docs')},
  {href: '/runs', label: 'Runs', match: (p: string) => p.startsWith('/runs')},
  {href: '/status', label: 'Status', match: (p: string) => p.startsWith('/status')},
];

/** Who is signed in, or the way to sign in. A link to /signin either way: that page holds sign-out. */
function SessionLink() {
  const {status, account} = useSession();
  if (status === 'loading') return null;
  const signedIn = status === 'in' && account;
  return (
    <Link
      href="/signin"
      className="hidden h-8 max-w-[11rem] items-center gap-1.5 rounded-lg border border-edge px-2.5 text-xs text-muted transition-colors hover:border-edge-strong hover:text-text sm:inline-flex"
    >
      {signedIn ? (
        <>
          <span className="sr-only">Signed in as</span>
          <span className="tabular truncate">{displayAccount(account)}</span>
        </>
      ) : (
        'Sign in'
      )}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !toggle.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <header
      className={
        'sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300 ' +
        (scrolled ? 'border-edge bg-ink/75 backdrop-blur-xl' : 'border-transparent bg-transparent')
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="Pactora home" className="group flex items-center">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
          {LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'relative rounded-lg px-3 py-1.5 transition-colors duration-200 ' +
                  (active ? 'text-text' : 'text-muted hover:bg-raised/60 hover:text-text')
                }
              >
                {link.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-[17px] h-px bg-gradient-to-r from-transparent via-accent to-transparent"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Which chain, and whether the money is real — on every page,
            because it is the one fact a viewer must never have to guess. */}
        <div className="ml-auto flex items-center gap-2">
          <SearchButton />
          <NetworkBadge />
          <NotificationsBell />
          <SessionLink />
          <Link
            href="/register"
            className="hidden h-8 items-center gap-1.5 rounded-lg bg-text px-3 text-xs font-medium text-ink transition-[transform,background-color] duration-200 hover:bg-white active:scale-[0.97] lg:inline-flex"
          >
            Register an agent
            <Icon name="arrowRight" className="size-3" />
          </Link>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-lg border border-edge text-muted transition-colors hover:text-text md:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        ref={menu}
        hidden={!open}
        className="border-t border-edge bg-ink/95 backdrop-blur-xl md:hidden"
      >
        <nav aria-label="Main" className="mx-auto grid max-w-6xl gap-1 px-4 py-3 animate-enter">
          {[
            ...LINKS,
            {href: '/register', label: 'Register an agent', match: (p: string) => p.startsWith('/register')},
            {href: '/join', label: 'Join as a person', match: (p: string) => p.startsWith('/join')},
            {href: '/me', label: 'My account', match: (p: string) => p.startsWith('/me')},
            {href: '/signin', label: 'Sign in', match: (p: string) => p.startsWith('/signin')},
          ].map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex items-center justify-between rounded-lg px-3 py-3 text-sm ' +
                  (active ? 'bg-raised text-text' : 'text-muted hover:bg-raised hover:text-text')
                }
              >
                {link.label}
                <Icon name="arrowRight" className="size-3.5 opacity-60" />
              </Link>
            );
          })}
        </nav>
      </div>
      <SearchPalette />
    </header>
  );
}
