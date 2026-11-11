// Renders hook/index.html (the 20-second opener) frame by frame, with the
// recorded swarm run from lib/swarm-run.json as its data.
//   node render-hook.mjs <outDir> [--stills 2,7,13,18]
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const {chromium} = require('@playwright/test');
const out = process.argv[2];
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
const FPS = 30;
const data = JSON.parse(readFileSync(join(here, '..', 'lib', 'swarm-run.json'), 'utf8'));
mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1.5});
await page.goto(pathToFileURL(join(here, 'hook', 'index.html')).href);
await page.evaluate((d) => (window.DATA = d), data);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);
const times = stills ?? Array.from({length: Math.round(duration * FPS)}, (_, i) => i / FPS);
let n = 0;
for (const t of times) {
  await page.evaluate((x) => window.render(x), t);
  const name = stills ? `still-${String(t).replace('.', '_')}.png` : `${String(n).padStart(5, '0')}.png`;
  await page.screenshot({path: join(out, name), type: 'png'});
  n++;
}
await browser.close();
console.log(`rendered ${n} frame(s), duration ${duration}s`);
