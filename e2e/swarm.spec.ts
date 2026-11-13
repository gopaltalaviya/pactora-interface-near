import {expect, test} from '@playwright/test';
import run from '../lib/swarm-run.json' with {type: 'json'};

/**
 * 2026-11-11: /swarm, a recorded swarm run as data. Public, no key, no API
 * call: everything on the page comes from lib/swarm-run.json.
 */

test('swarm: says where the run happened and how much it settled', async ({page}) => {
  await page.goto('/swarm');
  await expect(page.getByRole('heading', {level: 1, name: 'A market no one runs'})).toBeVisible();
  await expect(page.getByTestId('swarm-provenance')).toContainText(run.network);
  await expect(page.getByTestId('swarm-provenance')).toContainText(run.contract);
  await expect(page.getByTestId('swarm-totals')).toContainText(
    `${run.listings.length} listings, ${run.bids.length} bids, ${run.settlements.length} jobs settled on chain`,
  );
});

test('swarm: every buyer’s choice shows each bid with its score, and every settlement is listed', async ({
  page,
}) => {
  await page.goto('/swarm');
  await expect(page.getByTestId('swarm-choice')).toHaveCount(run.choices.length);
  const first = run.choices[0]!;
  await expect(page.getByTestId('swarm-choice').first()).toContainText(`chose ${first.chose}`);
  await expect(page.getByTestId('swarm-settlement')).toHaveCount(run.settlements.length);
});

test('swarm: the pooled purchase and the subcontract chain are explained', async ({page}) => {
  await page.goto('/swarm');
  const pool = page.getByTestId('swarm-pool');
  await expect(pool).toContainText(run.pool!.worker);
  await expect(pool).toContainText('same result hash');
  await expect(page.getByTestId('swarm-subcontract')).toContainText(
    `${run.subcontract!.client} hired ${run.subcontract!.middle}`,
  );
});

test('swarm: reached from the home page and /demo', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('link', {name: 'See the swarm'})).toHaveAttribute('href', '/swarm');
  await page.goto('/demo');
  // 2026-11-13: among the no-key ways in, above the key form (e2e/ux-audit.spec.ts).
  await expect(
    page.getByRole('region', {name: /No key\?/}).getByRole('link', {name: 'See the swarm'}),
  ).toHaveAttribute('href', '/swarm');
});

test('swarm: “Verify on chain” reads every settled job from a NEAR RPC node in the browser', async ({
  page,
}) => {
  const byId = new Map(run.settlements.map((s) => [Number(s.chainJobId), s]));
  await page.route('https://test.rpc.fastnear.com/**', async (route) => {
    const params = JSON.parse(route.request().postData() ?? '{}').params;
    const id = JSON.parse(Buffer.from(params.args_base64, 'base64').toString()).job_id as number;
    const s = byId.get(id);
    const job = s ? {state: 'Settled', amount: s.amount, result_hash: s.resultHash} : null;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'pactora',
        result: {result: [...Buffer.from(JSON.stringify(job))]},
      }),
    });
  });
  await page.goto('/swarm');
  await page.getByRole('button', {name: 'Verify on chain'}).click();
  await expect(page.getByTestId('swarm-verify-result')).toContainText(
    `${run.settlements.length} of ${run.settlements.length} jobs read from the chain`,
  );
});

test('swarm: the replay steps through the rounds from the keyboard, and says where it is', async ({page}) => {
  await page.goto('/swarm');
  const replay = page.getByRole('region', {name: 'Replay the run, step by step'});
  const status = replay.getByTestId('replay-status');
  await expect(status).toContainText('Step 1 of 5: Round 1: sellers bid');
  const next = replay.getByRole('button', {name: 'Next step'});
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Step 2 of 5: Round 1: buyers choose');
  await page.keyboard.press('Enter');
  await expect(status).toContainText('Round 2: reputation decides');
  await replay.getByRole('button', {name: 'Play'}).click();
  await expect(replay.getByRole('button', {name: 'Pause'})).toBeVisible();
  await expect(status).toContainText('Step 5 of 5: Round 4: a seller subcontracts', {timeout: 15_000});
  await expect(replay.getByRole('button', {name: 'Play'})).toBeVisible();
});

test('swarm: with reduced motion the replay is static, every step shown at once', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/swarm');
  const replay = page.getByRole('region', {name: 'Replay the run, step by step'});
  await expect(replay.getByTestId('replay-step')).toHaveCount(5);
  await expect(replay.getByRole('button', {name: 'Play'})).toHaveCount(0);
});
