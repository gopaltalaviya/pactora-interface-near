#!/usr/bin/env node
/**
 * Writes every logo file from the one geometry in lib/brand/mark.ts.
 *
 *   pnpm brand                  # the SVGs, app/favicon.ico and public/brand/*.png
 *   pnpm brand --kit <dir>      # also the brand kit (PNG + SVG) into <dir>, named as in
 *                               # the docs repo's docs/brand/
 *
 * SVGs are written as strings. PNGs are drawn by Chromium (Playwright, already
 * a dev dependency), so a raster icon looks exactly like the SVG a browser
 * draws. favicon.ico holds 16 and 32 px PNGs, which every current browser reads.
 *
 * lib/brand/mark.test.ts fails if any of these files drifts from mark.ts.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {STATIC_FILES, markSvg, markTransparentSvg, logoSvg, logoLightSvg} from '../lib/brand/mark.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = (path, data) => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, data);
  console.log(`wrote ${path.startsWith(root) ? path.slice(root.length + 1) : path}`);
};

for (const [path, svg] of Object.entries(STATIC_FILES)) write(join(root, path), `${svg()}\n`);

const geist = readFileSync(join(root, 'assets', 'fonts', 'Geist-SemiBold.ttf')).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({deviceScaleFactor: 1});

/** One PNG: `body` laid out in a width × height box, background left transparent unless set. */
async function png(body, width, height, background = 'transparent') {
  await page.setViewportSize({width, height});
  await page.setContent(
    `<!doctype html><style>@font-face{font-family:Geist;src:url(data:font/ttf;base64,${geist});font-weight:600}
     html,body{margin:0;width:${width}px;height:${height}px;background:${background};overflow:hidden}
     body{display:flex;align-items:center;justify-content:center}svg{display:block}</style>${body}`,
  );
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({omitBackground: background === 'transparent', type: 'png'});
}
const sized = (svg, w, h = w) => svg.replace('<svg ', `<svg width="${w}" height="${h}" `);

/** An .ico with PNG images inside (Windows Vista and later, every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({size, data}, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const favicon = [];
for (const size of [16, 32]) favicon.push({size, data: await png(sized(markSvg(), size), size, size)});
write(join(root, 'app', 'favicon.ico'), ico(favicon));
for (const size of [192, 512]) {
  write(join(root, 'public', 'brand', `pactora-${size}.png`), await png(sized(markSvg(), size), size, size));
}

const kitAt = process.argv.indexOf('--kit');
if (kitAt !== -1) {
  const dir = resolve(process.argv[kitAt + 1] ?? '');
  const out = (name, data) => write(join(dir, name), data);
  // The kit under the file names the docs repo uses (docs/brand/), so it can be copied there as is.
  out('pactora-mark.svg', `${markSvg()}\n`);
  out('pactora-mark-onlight.svg', `${markTransparentSvg()}\n`);
  out('pactora-logo.svg', `${logoSvg()}\n`);
  out('pactora-logo-onlight.svg', `${logoLightSvg()}\n`);
  // Square, dark: the mark on its tile, centred on ink — avatars, social profiles.
  out('pactora-logo-square-dark-1024.png', await png(sized(markSvg(), 720), 1024, 1024, '#07090d'));
  // Square, transparent: the tile alone, edge to edge — app icon.
  out('pactora-logo-square-transparent-1024.png', await png(sized(markSvg(), 1024), 1024, 1024));
  // Wide 1500 × 500: a banner (the X header size), mark and name on ink.
  out('pactora-logo-wide-dark-1500x500.png', await png(sized(logoSvg(), 888, 240), 1500, 500, '#07090d'));
  // The glyph alone, gradient on transparent — for white and light backgrounds.
  out('pactora-mark-onlight.png', await png(sized(markTransparentSvg(), 1000), 1000, 1000));
  // Mark and name on white.
  out('pactora-logo-onlight.png', await png(sized(logoLightSvg(), 1184, 320), 1400, 480, '#ffffff'));
}

await browser.close();
