/**
 * The handful of icons the interface uses, inline — no icon font, no package,
 * nothing the CSP has to allow. Decorative by default (`aria-hidden`); a
 * control that is only an icon carries its own `aria-label`.
 */

const PATHS = {
  copy: 'M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8Z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  external:
    'M14 5h5v5M19 5l-8 8M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  search: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  x: 'M6 6l12 12M18 6 6 18',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19c1.9 0 3.5-.6 4.9-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2',
  paste:
    'M9 4.5h6M9 4.5A1.5 1.5 0 0 0 7.5 6v.5h9V6A1.5 1.5 0 0 0 15 4.5M9 4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5M7.5 5.5H6A1.5 1.5 0 0 0 4.5 7v12A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V7A1.5 1.5 0 0 0 18 5.5h-1.5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  alert:
    'M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2 2 4-4',
  coins:
    'M9 7.5c3.6 0 6.5-1 6.5-2.25S12.6 3 9 3 2.5 4 2.5 5.25 5.4 7.5 9 7.5Zm-6.5-2.25v4.5C2.5 11 5.4 12 9 12s6.5-1 6.5-2.25m-13 0v4.5C2.5 15.5 5.4 16.5 9 16.5M15.5 12.5c3.6 0 6.5 1 6.5 2.25S19.1 17 15.5 17 9 16 9 14.75s2.9-2.25 6.5-2.25ZM9 14.75v4.5C9 20.5 11.9 21.5 15.5 21.5s6.5-1 6.5-2.25v-4.5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  users:
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m16 0v-1.5a3.5 3.5 0 0 0-2.5-3.35M14.5 4.15a3.5 3.5 0 0 1 0 6.7M13 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
  wallet:
    'M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16m1-8h-5a3 3 0 0 0 0 6h5V8Z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-4.3 3.2L3 20v-3h3v-3h3l1.2-1.2A4.5 4.5 0 0 1 14.5 9.5Zm1.5-1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({name, className = 'size-4'}: {name: IconName; className?: string}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
