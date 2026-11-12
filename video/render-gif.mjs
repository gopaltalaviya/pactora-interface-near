// Records short scenes of the live site and turns each into a small GIF for
// the READMEs (2026-11-12). Playwright records a WebM; ffmpeg (the
// linuxserver/ffmpeg Docker image, as for the other videos) makes the GIF.
//   node video/render-gif.mjs <outDir> [baseUrl]
// Needs Docker. Reads nothing private: public pages of the live site only.
import {execFileSync} from 'node:child_process';
import {mkdirSync, readdirSync, renameSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const {chromium} = require('@playwright/test');
const out = resolve(process.argv[2] ?? join(here, '..', 'public', 'media'));
const base = (process.argv[3] ?? 'https://pactora-interface-near.vercel.app').replace(/\/+$/, '');
mkdirSync(out, {recursive: true});

/** Each scene: a name and what to do on the page. */
const SCENES = [
  {
    name: 'verify-on-chain',
    run: async (page) => {
      await page.goto(`${base}/swarm`, {waitUntil: 'networkidle'});
      const button = page.getByRole('button', {name: 'Verify on chain'}).first();
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await button.click();
      await page.getByTestId('swarm-verify-result').first().waitFor({timeout: 30_000});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'receipts',
    run: async (page) => {
      await page.goto(`${base}/receipts`, {waitUntil: 'networkidle'});
      await page.waitForTimeout(1200);
      const button = page.getByRole('button', {name: 'Verify on chain'}).first();
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await button.click();
      await page.getByTestId('swarm-verify-result').first().waitFor({timeout: 30_000});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'swarm-replay',
    run: async (page) => {
      await page.goto(`${base}/swarm`, {waitUntil: 'networkidle'});
      const heading = page.getByRole('heading', {name: /Replay the run/});
      await heading.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(700);
      const play = page.getByRole('button', {name: /^Play/});
      if (await play.count()) await play.first().click();
      await page.waitForTimeout(9000);
    },
  },
  {
    name: 'start-here',
    run: async (page) => {
      await page.goto(`${base}/`, {waitUntil: 'networkidle'});
      await page.waitForTimeout(2500);
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(2500);
    },
  },
];

const browser = await chromium.launch();
for (const scene of SCENES) {
  const tmp = join(out, `.rec-${scene.name}`);
  rmSync(tmp, {recursive: true, force: true});
  const context = await browser.newContext({
    viewport: {width: 1280, height: 720},
    recordVideo: {dir: tmp, size: {width: 1280, height: 720}},
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await scene.run(page);
  } finally {
    await context.close();
  }
  const webm = readdirSync(tmp).find((f) => f.endsWith('.webm'));
  renameSync(join(tmp, webm), join(out, `${scene.name}.webm`));
  rmSync(tmp, {recursive: true, force: true});
  // Skip the page's fade-in; 9 fps, 800 px wide, one palette for the clip: small and sharp.
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${out}:/m`,
      'linuxserver/ffmpeg',
      '-y',
      '-loglevel',
      'error',
      '-ss',
      '0.8',
      '-i',
      `/m/${scene.name}.webm`,
      '-vf',
      'fps=9,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
      `/m/${scene.name}.gif`,
    ],
    {stdio: 'inherit', env: {...process.env, MSYS_NO_PATHCONV: '1'}},
  );
  rmSync(join(out, `${scene.name}.webm`), {force: true});
  console.log(`${scene.name}.gif`);
}
await browser.close();
