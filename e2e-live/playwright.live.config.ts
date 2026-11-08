import {defineConfig, devices} from '@playwright/test';

/**
 * LIVE browser tests: the real API, signer, indexer and notifier on the local
 * near-sandbox. Kept out of `pnpm test:e2e` (that one runs against
 * e2e/mock-api.mjs); run it on purpose:
 *
 *   1. the stack (pactora-backend-near, sandbox and Postgres/MinIO up):
 *        SANDBOX_KEY_FILE=.sandbox/validator_key.json node scripts/live-ui-stack.mjs
 *   2. a build of this app that talks to it, with the scripted-wallet hook:
 *        NEXT_PUBLIC_API_URL=http://127.0.0.1:8188 NEXT_PUBLIC_E2E_WALLET=1 \
 *        NEXT_PUBLIC_RPC_ORIGINS=http://127.0.0.1:3030 next build
 *      (LIVE_APP_DIR names another checkout to build and serve from, so the
 *      mock build in this one's .next is left alone.)
 *   3. playwright test -c e2e-live/playwright.live.config.ts
 *      (LIVE_ALL_BROWSERS=1 adds Firefox, WebKit and the two phones)
 *
 * The stack's wallet service signs for the page (see e2e-live/live.ts).
 * POST http://127.0.0.1:7288/shutdown stops the stack and drops its database.
 */
const PORT = Number(process.env['LIVE_WEB_PORT'] ?? 3188);
const APP_DIR = process.env['LIVE_APP_DIR'] ?? '.';

export default defineConfig({
  testDir: '.',
  testMatch: 'live.spec.ts',
  fullyParallel: false,
  workers: 5,
  retries: 0,
  reporter: 'list',
  timeout: 240_000,
  expect: {timeout: 15_000},
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    ...(process.env['LIVE_ALL_BROWSERS']
      ? [
          {name: 'firefox', use: {...devices['Desktop Firefox']}},
          {name: 'webkit', use: {...devices['Desktop Safari']}},
          {name: 'iphone', use: {...devices['iPhone 13']}},
          {name: 'android', use: {...devices['Pixel 7']}},
        ]
      : []),
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT} -H 127.0.0.1`,
    cwd: APP_DIR,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
