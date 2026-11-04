// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {render} from '@testing-library/react';
import {createElement} from 'react';
import {describe, expect, it} from 'vitest';
import {LogoMark} from '@/components/brand/Logo';
import manifest from '@/app/manifest';
import * as mark from './mark';

const {STATIC_FILES} = mark;

/**
 * The logo used to be copied by hand into seven places with a comment saying
 * "change all three". These tests replace the comment: a static file or a
 * component that no longer draws what `mark.ts` defines is a red test.
 * Regenerate the files with `pnpm brand`.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path));

/**
 * The Keystone Arch, chosen 2026-11-02. These are the numbers the owner signed
 * off, so a change to the geometry is a deliberate edit here too. The halves
 * end 2.25 units clear of the keystone (x 11.75 and 20.25): at 16 px a
 * narrower gap let the keystone fuse with the halves.
 */
describe('the mark is the Keystone Arch', () => {
  it('has exactly the agreed paths', () => {
    expect(mark.ARCH).toEqual({
      left: 'M4.24 28.18V16.42A11.2 11.2 0 0 1 12.913 5.653L14.457 11.037A5.6 5.6 0 0 0 10.4 16.42V28.18Z',
      right: 'M27.76 28.18V16.42A11.2 11.2 0 0 0 19.087 5.653L17.543 11.037A5.6 5.6 0 0 1 21.6 16.42V28.18Z',
      keystone: 'M13.23 3.923H18.77L17.212 10.953H14.788Z',
    });
  });

  it('is mirror-symmetric about x = 16', () => {
    const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const l = numbers(mark.ARCH.left);
    const r = numbers(mark.ARCH.right);
    // M x y V y A rx ry rot large sweep x y L x  y  A rx ry rot large sweep x  y  V y
    // 0 1 2   3   4  5   6     7     8 9   10 11   12 13  14   15    16  17 18   19
    expect(l).toHaveLength(r.length);
    l.forEach((n, i) => {
      if ([0, 8, 10, 17].includes(i))
        expect(n + r[i]!).toBeCloseTo(32, 9); // x mirrors
      else if ([7, 16].includes(i))
        expect(n + r[i]!).toBe(1); // the sweep flips
      else expect(n).toBe(r[i]); // y and radii match
    });
  });

  it('every static file draws the arch, in filled paths, and no rings', () => {
    for (const svg of Object.values(STATIC_FILES).map((f) => f())) {
      for (const d of Object.values(mark.ARCH)) expect(svg).toContain(`d="${d}"`);
      expect(svg).not.toContain('<circle');
      expect(svg).not.toContain('stroke');
    }
  });
});

describe('the logo has one source', () => {
  for (const [path, svg] of Object.entries(STATIC_FILES)) {
    it(`${path} is exactly what mark.ts draws`, () => {
      expect(read(path).toString('utf8').trim()).toBe(svg());
    });
  }

  it('the header and footer mark draws the same arch: two halves and a keystone', () => {
    const {container} = render(createElement(LogoMark));
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    expect(paths).toEqual([mark.ARCH.left, mark.ARCH.right, mark.ARCH.keystone]);
  });
});

/** PNG width and height live at bytes 16–23 of the IHDR chunk. */
function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('the raster icons exist at the sizes they claim', () => {
  it('favicon.ico holds 16 and 32 px PNG images', () => {
    const ico = read('app/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const [w, h] = pngSize(ico.subarray(offset, offset + length));
      expect(w).toBe(h);
      expect(ico[entry] || 256).toBe(w);
      sizes.push(w);
    }
    expect(sizes).toEqual([16, 32]);
  });

  it('every PNG icon in the manifest exists at its stated size', () => {
    const pngs = (manifest().icons ?? []).filter((i) => i.type === 'image/png');
    expect(pngs.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of pngs) {
      const [w, h] = pngSize(read(join('public', icon.src)));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });
});
