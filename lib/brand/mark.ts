/**
 * The Pactora mark, the Keystone Arch. An arch: its two halves are the two
 * agents; the keystone at the top is the pact that locks them together — take
 * it away and the arch falls. An arch is also a gateway: Pactora = pact +
 * agora, the marketplace.
 *
 * This file is the ONLY place the geometry is defined. Everything that draws
 * the mark reads it from here:
 *
 * - `components/brand/Logo.tsx` (header and footer), through `lib/brand/MarkShapes.tsx`
 * - `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`
 * - the static files `app/icon.svg`, `docs/brand/*.svg`, `app/favicon.ico` and
 *   `public/brand/*.png`, which `scripts/brand.mjs` writes from these strings
 *
 * `lib/brand/mark.test.ts` fails if a static file no longer matches, so a
 * change here is a change everywhere or a red test.
 *
 * Plain TypeScript with no imports, so `node --experimental-strip-types`
 * can load it from `scripts/brand.mjs` without a build step.
 */

/** One 32 × 32 grid. */
export const GRID = 32;

/** The tile behind the mark: a rounded square in the brand gradient. */
export const TILE = {rx: 8.5, from: '#6ea8ff', to: '#9d8cff'} as const;

/** The colour the mark is drawn in on the tile. */
export const INK = '#07090d';

/** Wordmark colours: "Pact" in text colour, "ora" in accent. */
export const TEXT = '#e8ecf4';
export const ACCENT = '#6ea8ff';
/** "ora" on white: the accent is 2.4:1 there, too faint; this blue is 4.7:1. */
export const ACCENT_ON_LIGHT = '#3b6fd8';

/**
 * The arch: three filled shapes, no strokes. Each half is the band between
 * two arcs (outer radius 11.2, inner 5.6, both centred on (16, 16.42))
 * standing on a straight leg; the keystone is a wedge on the axis, x = 16.
 *
 * The joints between the halves and the keystone are cut along the arch's
 * radius, as a stone arch is built: each half ends on the line 16° from the
 * vertical, the keystone sits between the 12.5° lines and rises above the
 * outer arc. The slits are thin on purpose. A wide vertical gap (the version
 * before this one, 2026-11-02) opened the inside of the arch up through the
 * gap and read as a bottle; with thin radial joints the opening keeps its
 * round top, and at 16 px the slits close into a solid arch, which still
 * reads. Chosen by eye at 16, 24, 32, 48, 96 and 200 px.
 */
export const ARCH = {
  left: 'M4.24 28.18V16.42A11.2 11.2 0 0 1 12.913 5.653L14.457 11.037A5.6 5.6 0 0 0 10.4 16.42V28.18Z',
  right: 'M27.76 28.18V16.42A11.2 11.2 0 0 0 19.087 5.653L17.543 11.037A5.6 5.6 0 0 1 21.6 16.42V28.18Z',
  keystone: 'M13.23 3.923H18.77L17.212 10.953H14.788Z',
} as const;

/**
 * The brand gradient. On the tile it spans the tile's own box. Drawn straight
 * onto a light background (`glyph`), it spans the 32 grid in user space, so
 * the whole glyph is one sweep — the default would give each shape its own.
 */
function gradient(id: string, glyph = false): string {
  const span = glyph
    ? `gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${GRID}" y2="${GRID}"`
    : 'x1="0" y1="0" x2="1" y2="1"';
  return `<linearGradient id="${id}" ${span}><stop offset="0%" stop-color="${TILE.from}"/><stop offset="100%" stop-color="${TILE.to}"/></linearGradient>`;
}

/** The two halves and the keystone in one colour (a hex, or `url(#id)`). */
function shapes(paint: string): string {
  const paths = [ARCH.left, ARCH.right, ARCH.keystone].map((d) => `<path d="${d}"/>`).join('');
  return `<g fill="${paint}">${paths}</g>`;
}

/** The mark on its tile, for dark or any background: app icon, favicon, avatars. */
export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}"><defs>${gradient('g')}</defs><rect width="${GRID}" height="${GRID}" rx="${TILE.rx}" fill="url(#g)"/>${shapes(INK)}</svg>`;
}

/** The mark alone on transparent, drawn in the gradient — for white and light backgrounds. */
export function markTransparentSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}"><defs>${gradient('g', true)}</defs>${shapes('url(#g)')}</svg>`;
}

/** Mark + wordmark, for dark backgrounds. */
export function logoSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 148 40" role="img" aria-label="Pactora"><defs>${gradient('g')}</defs><g transform="translate(4 4)"><rect width="${GRID}" height="${GRID}" rx="${TILE.rx}" fill="url(#g)"/>${shapes(INK)}</g><text x="46" y="29" font-family="Geist, Inter, system-ui, sans-serif" font-size="25" font-weight="600" letter-spacing="-0.6" fill="${TEXT}">Pact<tspan fill="${ACCENT}">ora</tspan></text></svg>`;
}

/** Mark + wordmark for white and light backgrounds: the mark in the gradient, "Pact" in ink. */
export function logoLightSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 148 40" role="img" aria-label="Pactora"><defs>${gradient('g', true)}</defs><g transform="translate(4 4)">${shapes('url(#g)')}</g><text x="46" y="29" font-family="Geist, Inter, system-ui, sans-serif" font-size="25" font-weight="600" letter-spacing="-0.6" fill="${INK}">Pact<tspan fill="${ACCENT_ON_LIGHT}">ora</tspan></text></svg>`;
}

/** Every static file written from this geometry, by repo-relative path. */
export const STATIC_FILES: Record<string, () => string> = {
  'app/icon.svg': markSvg,
  'docs/brand/pactora-mark.svg': markSvg,
  'docs/brand/pactora-mark-transparent.svg': markTransparentSvg,
  'docs/brand/pactora-logo.svg': logoSvg,
  'docs/brand/pactora-logo-light.svg': logoLightSvg,
};
