// Renders overview/index.html frame by frame: render(t) then a screenshot, at FPS.
//   node render-overview.mjs <outDir> [--stills 1,5,20]
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const {chromium} = require('@playwright/test');
const out = process.argv[2];
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
const FPS = 30;
mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1.5});
await page.goto(pathToFileURL(join(here, 'overview', 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);
const times = stills ?? Array.from({length: Math.round(duration * FPS)}, (_, i) => i / FPS);
let n = 0;
for (const t of times) {
  await page.evaluate((x) => window.render(x), t);
  const name = stills ? `still-${String(t).replace('.', '_')}.png` : `${String(n).padStart(5, '0')}.png`;
  await page.screenshot({path: join(out, name), type: 'png'});
  n++;
  if (!stills && n % 300 === 0) console.log(`${n}/${times.length}`);
}
await browser.close();
console.log(`rendered ${n} frame(s), duration ${duration}s`);
