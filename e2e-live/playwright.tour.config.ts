import {defineConfig, devices} from '@playwright/test';

/**
 * The demo video (public/video/demo.*): e2e-live/tour.spec.ts, recorded
 * against the REAL stack on the local near-sandbox. Not a test suite: one
 * slow, deliberate walk through every flow, in Chromium, while the page is
 * captured frame by frame (CDP screencast). Run it on purpose:
 *
 *   1. the stack, from pactora-backend-near, on a FRESH database (the agent
 *      run replays the committed model recordings, which name agent ids 1-4):
 *        SANDBOX_KEY_FILE=.sandbox/validator_key.json AGENT_REPLAY_MAX_MS=2500 \
 *          node scripts/live-ui-stack.mjs
 *   2. a build of this app that talks to it (see playwright.live.config.ts),
 *      in LIVE_APP_DIR;
 *   3. TOUR=1 TOUR_OUT=<dir> playwright test -c e2e-live/playwright.tour.config.ts
 *
 * TOUR_OUT receives frames/*.jpg (named by capture time), captions.json and
 * segments.json (the stretches to speed up or cut); the encoding is done
 * from those, outside this repository.
 */
const PORT = Number(process.env['LIVE_WEB_PORT'] ?? 3188);
const APP_DIR = process.env['LIVE_APP_DIR'] ?? '.';

export default defineConfig({
  testDir: '.',
  testMatch: 'tour.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30 * 60_000,
  expect: {timeout: 30_000},
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    video: 'off',
    actionTimeout: 60_000,
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT} -H 127.0.0.1`,
    cwd: APP_DIR,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
