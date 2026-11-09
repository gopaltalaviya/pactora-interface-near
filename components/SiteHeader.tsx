'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useId, useRef, useState} from 'react';
import {Logo} from './brand/Logo';
import {NetworkBadge} from './NetworkBadge';
import {SearchButton} from './search/SearchButton';
import {SearchPalette} from './search/SearchPalette';
import {NotificationsBell} from '@/components/market/NotificationsBell';
import {useAdminRoles} from '@/lib/admin-roles';
import {useSession} from '@/lib/session';
import {displayAccount} from '@/lib/near';
import {Icon} from './ui/Icon';

/**
 * The frame's top bar: where you are, where you can go, and which chain the
 * money is on.
 *
 * The current section is marked (visually and with aria-current), so "where
 * am I?" never needs the URL. Below `lg` (1024px) the links fold into a menu
 * that closes on Escape, on navigation, and on a click outside: between 768
 * and 1024 the full row did not fit (live audit 2026-11-09), and a bar that
 * overflows the viewport scrolls the whole page sideways.
 *
 * Everything in the bar is one row. Each item keeps its width
 * (`shrink-0 whitespace-nowrap`), so a tight viewport never folds a label
 * onto two lines inside a 32px button; instead the less essential parts
 * appear only where there is room for them: the network's full name and the
 * search label from `xl`, the register button from `xl`, its long form from
 * `2xl`. The account chip opens a small menu (account, notifications, admin
 * for council members and reviewers, sign out).
 */

const LINKS = [
  {href: '/demo', label: 'Demo', match: (p: string) => p.startsWith('/demo')},
  {href: '/agents', label: 'Marketplace', match: (p: string) => p.startsWith('/agents')},
  {href: '/jobs', label: 'Jobs', match: (p: string) => p.startsWith('/jobs')},
  {href: '/people', label: 'People', match: (p: string) => p.startsWith('/people')},
  {href: '/docs', label: 'Docs', match: (p: string) => p.startsWith('/docs')},
  {href: '/runs', label: 'Runs', match: (p: string) => p.startsWith('/runs')},
  {href: '/status', label: 'Status', match: (p: string) => p.startsWith('/status')},
];

const MENU_ITEM =
  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[0.875rem] text-muted transition-colors hover:bg-raised hover:text-text focus-visible:bg-raised focus-visible:text-text focus-visible:outline-none';

/**
 * Who is signed in, as a menu; or the way to sign in. The admin roles are
 * asked for only when the menu opens (lib/admin-roles.ts).
 */
function AccountMenu() {
  const {status, account, person, signOut} = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {roles} = useAdminRoles(open);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    // The first item takes focus, so the keyboard is in the menu, not on the button.
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (status === 'loading') return null;
  if (status !== 'in' || !account) {
    return (
      <Link
        href="/signin"
        className="hidden h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-edge bg-surface/60 px-2.5 text-xs text-muted transition-colors hover:border-edge-strong hover:bg-raised hover:text-text sm:inline-flex"
      >
        Sign in
      </Link>
    );
  }

  const items: {href: string; label: string}[] = [
    {href: '/me', label: 'My account'},
    ...(person ? [{href: '/notifications', label: 'Notifications'}] : []),
    ...(roles.length > 0 ? [{href: '/admin', label: 'Admin'}] : []),
  ];

  return (
    <div className="relative hidden sm:block">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={`Account menu for ${account}`}
        title={account}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 max-w-[8rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-edge bg-surface/60 px-2.5 text-xs text-muted transition-colors hover:border-edge-strong hover:bg-raised hover:text-text aria-expanded:border-edge-strong aria-expanded:bg-raised aria-expanded:text-text xl:max-w-[11rem]"
      >
        <span className="tabular truncate">{displayAccount(account)}</span>
        <Icon
          name="arrowRight"
          className={`size-3 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
      <div
        ref={menu}
        id={`${id}-menu`}
        role="menu"
        aria-label="Account"
        hidden={!open}
        className="absolute right-0 top-10 z-50 w-60 animate-enter space-y-0.5 rounded-xl border border-edge-strong/70 bg-overlay/95 p-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_24px_48px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl"
      >
        <p
          className="tabular mb-1 truncate border-b border-edge px-3 pb-2 pt-1.5 text-xs text-muted"
          title={account}
        >
          {account}
        </p>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => setOpen(false)}
          >
            {item.label}
            <Icon name="arrowRight" className="size-3 opacity-60" />
          </Link>
        ))}
        <button
          type="button"
          role="menuitem"
          className={MENU_ITEM}
          onClick={() => {
            setOpen(false);
            void signOut()
              .then(() => router.push('/signin'))
              .catch(() => router.push('/signin'));
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? '/';
  const {status, person} = useSession();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const {roles} = useAdminRoles(open);

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

  // The menu offers the one account link that applies: signed in, the
  // account page (which links to sign-out); otherwise, sign in.
  const menuLinks = [
    ...LINKS,
    {href: '/register', label: 'Register an agent', match: (p: string) => p.startsWith('/register')},
    {href: '/join', label: 'Join as a person', match: (p: string) => p.startsWith('/join')},
    ...(status === 'in'
      ? [
          {href: '/me', label: 'My account', match: (p: string) => p.startsWith('/me')},
          ...(person
            ? [
                {
                  href: '/notifications',
                  label: 'Notifications',
                  match: (p: string) => p.startsWith('/notifications'),
                },
              ]
            : []),
          ...(roles.length > 0
            ? [{href: '/admin', label: 'Admin', match: (p: string) => p.startsWith('/admin')}]
            : []),
        ]
      : [{href: '/signin', label: 'Sign in', match: (p: string) => p.startsWith('/signin')}]),
  ];

  return (
    <header
      className={
        'sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-300 ' +
        (scrolled
          ? 'border-edge/80 bg-ink/75 shadow-[0_8px_24px_-16px_rgb(0_0_0/0.8)]'
          : 'border-transparent bg-ink/30')
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:gap-4 xl:gap-6">
        <Link href="/" aria-label="Pactora home" className="group flex shrink-0 items-center">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 text-[0.875rem] lg:flex xl:gap-1">
          {LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'relative inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-1.5 transition-colors duration-200 xl:px-3 ' +
                  (active ? 'bg-white/[0.06] text-text' : 'text-muted hover:bg-white/[0.04] hover:text-text')
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
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SearchButton />
          <NetworkBadge />
          <NotificationsBell />
          <AccountMenu />
          <Link
            href="/register"
            aria-label="Register an agent"
            // Signed in, the account chip takes the room (NEAR account ids are
            // long): the button waits for 2xl, and the menu still offers it.
            className={`group/cta hidden h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-text px-3 text-xs font-medium text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_18px_-8px_rgb(233_237_245/0.45)] transition-[transform,background-color] duration-200 hover:bg-white active:scale-[0.97] ${status === 'in' ? '2xl:inline-flex' : 'xl:inline-flex'}`}
          >
            <span className="2xl:hidden">Register</span>
            <span className="hidden 2xl:inline">Register an agent</span>
            <Icon
              name="arrowRight"
              className="size-3 transition-transform duration-200 group-hover/cta:translate-x-0.5"
            />
          </Link>
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-edge bg-surface/60 text-muted transition-colors hover:border-edge-strong hover:bg-raised hover:text-text aria-expanded:bg-raised aria-expanded:text-text lg:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        ref={menu}
        hidden={!open}
        className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-edge bg-ink/95 shadow-[0_24px_48px_-16px_rgb(0_0_0/0.8)] backdrop-blur-xl lg:hidden"
      >
        <nav aria-label="Main" className="mx-auto grid max-w-6xl gap-1 px-4 py-3 animate-enter sm:px-6">
          {menuLinks.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex min-h-11 items-center justify-between rounded-xl px-3.5 py-3 text-[0.9375rem] transition-colors ' +
                  (active
                    ? 'bg-raised font-medium text-text shadow-[inset_2px_0_0_var(--color-accent)]'
                    : 'text-muted hover:bg-raised/70 hover:text-text')
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
