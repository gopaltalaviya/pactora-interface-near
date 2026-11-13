import {expect, test, type Page, type Route} from '@playwright/test';

/**
 * Edge, critical and worst cases, in a real browser against the production
 * build. Each test makes the API misbehave in one specific way with
 * page.route(); the mock API answers everything else as usual.
 */

const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const NEW_RUN = '7e1d2c3b-4a59-4687-9a0b-112233445566';
const KEY = 'ax_0123456789abcdef_secretsecretsecretsecret00';
const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: {'access-control-allow-origin': '*'},
    body: JSON.stringify(body),
  });

const agent = (agentId: number, extra: Record<string, unknown> = {}) => ({
  agentId,
  chainId: 'near:testnet',
  chainAgentId: String(100 + agentId),
  name: `Agent ${agentId}`,
  description: 'does things',
  capabilities: ['market-research'],
  pricePerTask: '20000',
  priceDisplay: '0.02 USDC',
  walletAddress: 'researchbot.owner.testnet',
  score: 60,
  completed: 2,
  failed: 0,
  successRate: 1,
  active: true,
  explorerUrl: 'https://testnet.nearblocks.io/address/researchbot.owner.testnet',
  ...extra,
});

async function noUncaughtErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

// ── Critical: money ────────────────────────────────────────────────────────

test('critical: double-clicking Run, or Ctrl+Enter twice, starts exactly ONE run', async ({page}) => {
  let starts = 0;
  await page.route('**/v1/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    starts++;
    await new Promise((r) => setTimeout(r, 600)); // a slow API makes a double submit likely
    return json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`});
  });
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {'access-control-allow-origin': '*'},
      body: 'event: finished\ndata: {"spent":"0"}\n\n',
    }),
  );
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).dblclick();
  await page.getByLabel('Goal').press('Control+Enter');
  await page.getByLabel('Goal').press('Control+Enter');
  await page.waitForTimeout(1500);
  expect(starts).toBe(1);
});

test('critical: the key is sent trimmed, and only in the Authorization header', async ({page}) => {
  let auth = '';
  let body = '';
  await page.route('**/v1/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    auth = route.request().headers()['authorization'] ?? '';
    body = route.request().postData() ?? '';
    return json(route, 401, {code: 'UNAUTHORIZED', detail: 'unknown key'});
  });
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(`   ${KEY}  \n`);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  await expect(page.getByText('The run did not start')).toBeVisible();
  expect(auth).toBe(`Bearer ${KEY}`);
  expect(body).not.toContain(KEY);
});

test('critical: register refuses what the API would refuse — before the wallet signs anything', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('N'.repeat(65));
  await expect(page.getByText(/64 characters at most/)).toBeVisible();
  await page.getByLabel('Name').fill('ResearchBot');
  await page.getByLabel('What it does').fill('d'.repeat(1001));
  await expect(page.getByText(/1,000 characters at most/)).toBeVisible();
  await page.getByLabel('What it does').fill('');
  await page.getByLabel('Capabilities').fill(Array.from({length: 17}, (_, i) => `cap-${i}`).join(','));
  await expect(page.getByText(/16 capabilities at most/)).toBeVisible();
  await page.getByLabel('Capabilities').fill('market-research');
  await page.getByLabel(/Price per task/).fill('9'.repeat(39));
  await expect(page.getByText(/larger than the escrow can hold/)).toBeVisible();
});

// ── The API misbehaving ────────────────────────────────────────────────────

for (const [label, path, pattern] of [
  ['marketplace', '/agents', '**/v1/agents?*'],
  ['agent profile', '/agents/1', '**/v1/agents/1'],
  ['run record', `/runs/${RUN_ID}`, `**/v1/runs/${RUN_ID}`],
] as const) {
  test(`${label}: a 500 shows a readable error, and Retry recovers`, async ({page}) => {
    const errors = await noUncaughtErrors(page);
    let calls = 0;
    await page.route(pattern, (route) => {
      calls++;
      return calls === 1 ? json(route, 500, {code: 'INTERNAL', detail: 'boom'}) : route.fallback();
    });
    await page.goto(path);
    const alert = page
      .getByRole('alert')
      .filter({hasText: /The API had a problem \(500\)/})
      .first();
    await expect(alert).toBeVisible();
    // The detail of a 5xx is written for an operator, not shown to a visitor.
    await expect(alert).not.toContainText('boom');
    await page.getByRole('button', {name: /Retry/}).click();
    await expect(page.getByRole('alert').filter({hasText: /had a problem/})).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('malformed JSON from the API is reported in words, not as a parser error', async ({page}) => {
  await page.route('**/v1/agents?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {'access-control-allow-origin': '*'},
      body: '<html>proxy error</html>',
    }),
  );
  await page.goto('/agents');
  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/Unexpected token|JSON\.parse|SyntaxError/);
  await expect(alert).toContainText(/not a valid response|unexpected answer/i);
});

test('an unreachable API is reported as such, not as a raw "Failed to fetch"', async ({page}) => {
  await page.route('**/v1/agents?*', (route) => route.abort('internetdisconnected'));
  await page.goto('/agents');
  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/cannot reach the Pactora API/i);
});

test('a hanging API shows loading, never a blank page', async ({page}) => {
  await page.route('**/v1/agents?*', () => new Promise(() => {})); // never answers
  await page.goto('/agents');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('Marketplace');
  await expect(page.getByRole('status').filter({hasText: /Loading agents/})).toBeAttached();
});

// ── Hostile and unusual data ───────────────────────────────────────────────

test('hostile strings from the API render as text and never run', async ({page}) => {
  await page.route('**/v1/agents?*', (route) =>
    json(route, 200, {agents: [agent(1, {name: XSS, description: XSS, capabilities: ['x-s-s']})]}),
  );
  await page.route('**/v1/agents/1', (route) => json(route, 200, agent(1, {name: XSS, description: XSS})));
  await page.goto('/agents');
  await expect(page.getByText(XSS).first()).toBeVisible();
  await page.goto('/agents/1');
  await expect(page.getByRole('heading', {level: 1})).toContainText('<img');
  expect(await page.evaluate(() => (window as unknown as {__xss?: number}).__xss)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test('a 300-character unbroken name, RTL and emoji: no sideways scroll on a phone', async ({page}) => {
  await page.setViewportSize({width: 375, height: 800});
  const long = 'A'.repeat(300);
  await page.route('**/v1/agents?*', (route) =>
    json(route, 200, {agents: [agent(1, {name: long}), agent(2, {name: 'وكيل البحث 🔍🤖 Агент'})]}),
  );
  await page.route('**/v1/agents/1', (route) => json(route, 200, agent(1, {name: long, description: long})));
  for (const path of ['/agents', '/agents/1']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
  }
  await page.goto('/agents');
  await expect(page.getByText('وكيل البحث 🔍🤖 Агент')).toBeVisible();
});

test('missing and null optional fields do not break a profile', async ({page}) => {
  const errors = await noUncaughtErrors(page);
  await page.route('**/v1/agents/1', (route) =>
    json(
      route,
      200,
      agent(1, {
        description: null,
        chainAgentId: null,
        successRate: null,
        completed: 0,
        failed: 0,
        explorerUrl: '',
      }),
    ),
  );
  await page.goto('/agents/1');
  await expect(page.getByText(/not registered on chain/)).toBeVisible();
  await expect(page.getByText('unproven').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('volume: 100 agents and a 500-event trace render', async ({page}) => {
  await page.route('**/v1/agents?*', (route) =>
    json(route, 200, {agents: Array.from({length: 100}, (_, i) => agent(i + 1))}),
  );
  await page.goto('/agents');
  await expect(page.getByText('View profile')).toHaveCount(100);

  const events = Array.from({length: 500}, (_, i) => ({
    kind: i % 2 ? 'discovered' : 'selected',
    payload: {
      capability: 'market-research',
      candidates: 1,
      agentId: 2,
      price: '0.02 USDC',
      reason: `step ${i}`,
    },
    occurredAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 0) + i * 100).toISOString(),
  }));
  await page.route(`**/v1/runs/${RUN_ID}`, (route) =>
    json(route, 200, {
      runId: RUN_ID,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'Big run',
      state: 'done',
      spent: '0',
      spentDisplay: '0 USDC',
      startedAt: '2026-09-30T12:00:00Z',
      finishedAt: '2026-09-30T12:01:00Z',
      answer: 'ok',
      error: null,
      steps: [],
      events,
    }),
  );
  const t0 = Date.now();
  await page.goto(`/runs/${RUN_ID}`);
  await expect(page.getByRole('list', {name: 'Run trace'}).locator('li')).toHaveCount(500);
  expect(Date.now() - t0).toBeLessThan(8000);
});

test('every way a step can end is named in words', async ({page}) => {
  // A status code is not a word: each one has a label a judge can read.
  const labels: Record<string, string> = {
    settled: 'Settled',
    disputed: 'Disputed',
    unrecoverable: 'Judged bad, already paid',
    'no-candidate': 'No agent available',
    'budget-exceeded': 'Over budget',
    declined: 'Declined by the agent',
    timeout: 'Timed out',
    failed: 'Failed',
  };
  const statuses = Object.keys(labels);
  await page.route(`**/v1/runs/${RUN_ID}`, (route) =>
    json(route, 200, {
      runId: RUN_ID,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'Every outcome',
      state: 'failed',
      spent: '0',
      spentDisplay: '0 USDC',
      startedAt: '2026-09-30T12:00:00Z',
      finishedAt: null,
      answer: null,
      error: 'the model could not be reached',
      steps: statuses.map((status) => ({capability: `cap-${status}`, status, detail: `why ${status}`})),
      events: [
        {kind: 'plan-failed', payload: {reason: 'model unreachable'}, occurredAt: '2026-09-30T12:00:01Z'},
      ],
    }),
  );
  await page.goto(`/runs/${RUN_ID}`);
  for (const s of statuses) {
    await expect(page.getByText(labels[s]!, {exact: true}).first()).toBeVisible();
    await expect(page.getByText(`why ${s}`)).toBeVisible();
  }
  await expect(page.getByText('The run failed')).toBeVisible();
  await expect(page.getByText(/no plan — model unreachable/)).toBeVisible();
});

test('a refused review is said plainly, and an unsettled step claims none', async ({page}) => {
  const JOB_A = '11111111-1111-4111-8111-111111111111';
  const JOB_B = '22222222-2222-4222-8222-222222222222';
  await page.route(`**/v1/runs/${RUN_ID}`, (route) =>
    json(route, 200, {
      runId: RUN_ID,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'Two steps',
      state: 'done',
      spent: '20000',
      spentDisplay: '0.02 USDC',
      startedAt: '2026-09-30T12:00:00Z',
      finishedAt: '2026-09-30T12:01:00Z',
      answer: 'ok',
      error: null,
      steps: [
        {capability: 'market-research', status: 'settled', detail: 'paid', jobId: JOB_A, agentId: 1},
        {capability: 'trade-analysis', status: 'disputed', detail: 'rejected', jobId: JOB_B, agentId: 2},
      ],
      events: [],
    }),
  );
  await page.route(`**/v1/jobs/${JOB_A}`, (route) =>
    json(route, 200, {
      events: [
        {
          kind: 'settled',
          explorerUrl: 'https://testnet.nearblocks.io/txns/6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm',
        },
        {
          kind: 'feedback_failed',
          explorerUrl: 'https://testnet.nearblocks.io/txns/6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm',
        },
      ],
    }),
  );
  let disputedJobRead = false;
  await page.route(`**/v1/jobs/${JOB_B}`, (route) => {
    disputedJobRead = true;
    return json(route, 200, {events: [{kind: 'disputed', explorerUrl: null}]});
  });
  await page.route('**/v1/agents/1', (route) => json(route, 200, agent(1)));
  await page.goto(`/runs/${RUN_ID}`);
  await expect(page.getByText(/reputation registry refused the review/)).toBeVisible();
  await expect(page.getByText(/Review written on chain/)).toHaveCount(0);
  expect(disputedJobRead).toBe(false);
});

// ── The live stream failing ────────────────────────────────────────────────

test('worst case: the live stream drops mid-run — the page says so and links the record', async ({page}) => {
  await page.route('**/v1/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`});
  });
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) => route.abort('connectionreset'));
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  await expect(page.getByText(/connection to the live trace was lost/i)).toBeVisible({timeout: 20000});
  await expect(page.getByRole('link', {name: /open the run record/i})).toHaveAttribute(
    'href',
    `/runs/${NEW_RUN}`,
  );
});

// ── Navigation ─────────────────────────────────────────────────────────────

test('deep links to a docs section land on it; back and forward work', async ({page}) => {
  await page.goto('/docs/concepts#exits');
  await expect(page.locator('#exits')).toBeInViewport();
  await page
    .getByRole('link', {name: /Build an agent/})
    .first()
    .click();
  await page.waitForURL('**/docs/build-an-agent');
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/concepts/);
  await page.goForward();
  await expect(page).toHaveURL(/\/docs\/build-an-agent/);
});

test('the header fits a 320px phone on every main page (menu button reachable)', async ({page}) => {
  // Some twenty pages, each loaded to network idle: slow on a busy machine.
  test.slow();
  await page.setViewportSize({width: 320, height: 700});
  for (const path of [
    '/',
    '/agents',
    '/demo',
    '/status',
    '/register',
    '/signin',
    '/join',
    '/jobs',
    '/jobs/new',
    '/me',
    '/docs',
    '/docs/concepts',
    '/about',
    '/fees',
    '/risks',
    '/contact',
    '/terms',
    '/privacy',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${path} overflows by ${over}px`).toBeLessThanOrEqual(0);
    const menu = await page.getByRole('button', {name: /menu/i}).boundingBox();
    expect(menu!.x + menu!.width, `${path}: menu button off-screen`).toBeLessThanOrEqual(320);
  }
});

test('the status page tells a stopped indexer from one catching up', async ({page}) => {
  const report = (indexer: 'down' | 'degraded', secondsSinceIndexed: number) => ({
    status: 'degraded',
    checkedAt: new Date().toISOString(),
    build: null,
    components: {api: 'up', database: 'up', signer: 'up', rpc: 'up', indexer},
    chains: [
      {
        chainId: 'near:testnet',
        name: 'NEAR Testnet',
        testnet: true,
        rpc: 'up',
        headBlock: 1_500,
        indexer: {
          status: indexer,
          indexedBlock: 1_000,
          lagBlocks: 500,
          lastIndexedAt: null,
          secondsSinceIndexed,
        },
      },
    ],
  });
  let current = report('down', 300);
  await page.route('**/v1/status', (route) => json(route, 200, current));
  await page.goto('/status');
  const row = page.getByRole('listitem').filter({hasText: 'Indexer'});
  await expect(row).toContainText('Down');
  await expect(row).toContainText('Stopped — no progress for 5 min');
  current = report('degraded', 2);
  await page.getByRole('button', {name: 'Refresh'}).click();
  await expect(row).toContainText('Catching up — 500 blocks behind');
});

test('a run whose record is still being written when the stream ends still shows its answer', async ({
  page,
}) => {
  // The live stream can say "finished" a moment before the record has the
  // answer (an older API wrote it after the event). The page read once and
  // showed a finished run with no answer.
  const finished = {
    runId: NEW_RUN,
    chainId: 'near:testnet',
    network: 'NEAR Testnet',
    testnet: true,
    goal: 'g',
    spent: '20000',
    spentDisplay: '0.02 USDC',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
    events: [],
  };
  let reads = 0;
  await page.route('**/v1/runs', (route) =>
    route.request().method() === 'POST'
      ? json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`})
      : route.fallback(),
  );
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {'access-control-allow-origin': '*'},
      body: 'event: finished\ndata: {"spent":"20000"}\n\n',
    }),
  );
  await page.route(`**/v1/runs/${NEW_RUN}`, (route) => {
    reads++;
    return reads === 1
      ? json(route, 200, {...finished, state: 'running', answer: null, steps: []})
      : json(route, 200, {
          ...finished,
          state: 'done',
          answer: 'Thin liquidity — wait.',
          steps: [{capability: 'market-research', status: 'settled', detail: 'paid 0.02 USDC'}],
        });
  });
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  await expect(page.getByText('Thin liquidity — wait.')).toBeVisible({timeout: 10_000});
  expect(reads).toBeGreaterThanOrEqual(2);
});

test('a run that delivered nothing says so on the demo page, with the reason — never a green "finished"', async ({
  page,
}) => {
  // It used to end `done` with no error, so the page showed a green badge and
  // a full progress bar for a run where no agent delivered anything.
  const reason =
    'No agent delivered. market-research: agent 2 declined: needs a private wallet export — cancelled and refunded.';
  await page.route('**/v1/runs', (route) =>
    route.request().method() === 'POST'
      ? json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`})
      : route.fallback(),
  );
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {'access-control-allow-origin': '*'},
      body: `event: failed
data: ${JSON.stringify({detail: reason, spent: '0'})}

`,
    }),
  );
  await page.route(`**/v1/runs/${NEW_RUN}`, (route) =>
    json(route, 200, {
      runId: NEW_RUN,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'g',
      state: 'failed',
      spent: '0',
      spentDisplay: '0 USDC',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      answer: null,
      error: reason,
      steps: [
        {
          capability: 'market-research',
          status: 'declined',
          detail: 'agent 2 declined: needs a private wallet export — cancelled and refunded',
        },
      ],
      events: [],
    }),
  );
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();

  await expect(page.getByText('The run did not deliver')).toBeVisible({timeout: 10_000});
  await expect(page.getByRole('alert').filter({hasText: 'The run did not deliver'})).toContainText(
    'needs a private wallet export',
  );
  await expect(page.getByRole('status').getByText('failed', {exact: true})).toBeVisible();
  await expect(page.getByRole('status').getByText('finished', {exact: true})).toHaveCount(0);
  await expect(page.getByText('Declined by the agent', {exact: true})).toBeVisible();
  await expect(
    page.getByRole('list', {name: 'Run progress'}).getByText('Failed', {exact: true}),
  ).toBeVisible();
});

test('a live stream that drops and reconnects shows each line once, and only a real ending ends the run', async ({
  page,
}) => {
  // The server replays a run's whole history on every connection. Chrome
  // reconnects by itself and every line used to appear twice; Firefox gave up
  // instead, and the closed stream read as "finished".
  let connections = 0;
  await page.route('**/v1/runs', (route) =>
    route.request().method() === 'POST'
      ? json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`})
      : route.fallback(),
  );
  const planned = 'event: planned\ndata: {"subtasks":1,"reasoning":"one step"}\n\n';
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) => {
    connections++;
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {'access-control-allow-origin': '*'},
      // First connection: history so far, then the connection ends. Second: the
      // replayed history and the end of the run.
      body:
        connections === 1
          ? `retry: 300\n\n${planned}`
          : `${planned}event: finished\ndata: {"spent":"20000"}\n\n`,
    });
  });
  await page.route(`**/v1/runs/${NEW_RUN}`, (route) =>
    json(route, 200, {
      runId: NEW_RUN,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'g',
      state: 'done',
      spent: '20000',
      spentDisplay: '0.02 USDC',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      answer: 'Done after a reconnect.',
      error: null,
      steps: [],
      events: [],
    }),
  );
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  await expect(page.getByText('Done after a reconnect.')).toBeVisible({timeout: 20_000});
  expect(connections).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('list', {name: 'Run trace'}).getByText('planned', {exact: true})).toHaveCount(
    1,
  );
});

test('an orchestrator over its daily run cap is told so in words, and nothing starts', async ({page}) => {
  await page.route('**/v1/runs', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 429,
          contentType: 'application/problem+json',
          headers: {'access-control-allow-origin': '*', 'retry-after': '3600'},
          body: JSON.stringify({
            status: 429,
            code: 'RATE_LIMITED',
            detail: 'this orchestrator has started 10 runs in the last 24 hours, its limit — try again later',
          }),
        })
      : route.fallback(),
  );
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  await expect(page.getByText(/10 runs in the last 24 hours, its limit/)).toBeVisible();
  await expect(page.getByRole('list', {name: 'Run trace'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Run', exact: true})).toBeEnabled();
});

// ── The AI model out of its free quota ─────────────────────────────────────
// A judge must not mistake "the demo's free AI key is used up" for "Pactora is
// broken": say so before the run, and name it after one.
const LIMITED = {
  state: 'limited',
  since: new Date(Date.now() - 20 * 60_000).toISOString(),
  detail: 'AI model unavailable: its free request quota is used up for now',
  lastDelivered: {
    runId: '11111111-2222-4333-8444-555555555555',
    at: new Date(Date.now() - 3_600_000).toISOString(),
  },
};
const statusWith = (model: unknown) => ({
  status: 'operational',
  checkedAt: new Date().toISOString(),
  build: null,
  components: {api: 'up', database: 'up', signer: 'up', rpc: 'up', indexer: 'up'},
  chains: [],
  model,
});

test('when the AI model is out of quota, the demo says so before Run — and that Pactora works', async ({
  page,
}) => {
  await page.route('**/v1/status', (route) => json(route, 200, statusWith(LIMITED)));
  await page.goto('/demo');
  const notice = page.getByRole('status').filter({hasText: 'free daily quota'});
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Pactora itself is working');
  await expect(notice.getByRole('link', {name: 'See the last run that delivered'})).toHaveAttribute(
    'href',
    `/runs/${LIMITED.lastDelivered.runId}`,
  );
  await expect(notice.getByRole('link', {name: /Watch a recorded live run/})).toHaveAttribute(
    'href',
    'https://youtu.be/IQESfGqXn1M',
  );
});

test('no quota notice when the model is fine', async ({page}) => {
  await page.route('**/v1/status', (route) =>
    json(route, 200, statusWith({...LIMITED, state: 'ok', since: null, detail: null})),
  );
  await page.goto('/demo');
  await expect(page.getByLabel('Orchestrator API key')).toBeVisible();
  await expect(page.getByText('free daily quota')).toHaveCount(0);
});

test('a run stopped by the AI model is named as that, not as a broken run', async ({page}) => {
  const reason = 'No plan: AI model unavailable: its free request quota is used up for now';
  await page.route('**/v1/status', (route) => json(route, 200, statusWith(LIMITED)));
  await page.route('**/v1/runs', (route) =>
    route.request().method() === 'POST'
      ? json(route, 202, {runId: NEW_RUN, eventsUrl: `/v1/runs/${NEW_RUN}/events`})
      : route.fallback(),
  );
  await page.route(`**/v1/runs/${NEW_RUN}/events`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {'access-control-allow-origin': '*'},
      body: `event: failed\ndata: ${JSON.stringify({detail: reason, spent: '0'})}\n\n`,
    }),
  );
  await page.route(`**/v1/runs/${NEW_RUN}`, (route) =>
    json(route, 200, {
      runId: NEW_RUN,
      chainId: 'near:testnet',
      network: 'NEAR Testnet',
      testnet: true,
      goal: 'g',
      state: 'failed',
      spent: '0',
      spentDisplay: '0 USDC',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      answer: null,
      error: reason,
      steps: [],
      events: [],
    }),
  );
  await page.goto('/demo');
  await page.getByLabel('Orchestrator API key').fill(KEY);
  await page.getByRole('button', {name: 'Run', exact: true}).click();
  const notice = page.getByRole('alert').filter({hasText: 'The AI model was unavailable'});
  await expect(notice).toBeVisible({timeout: 10_000});
  await expect(notice).toContainText('this is not a protocol failure');
  await expect(notice).toContainText('none was paid for');
  await expect(page.getByText('The run did not deliver')).toHaveCount(0);

  // The record page says the same.
  await page.goto(`/runs/${NEW_RUN}`);
  await expect(
    page.getByText('The AI model was unavailable — this is not a protocol failure.'),
  ).toBeVisible();
  await expect(page.getByText('The run failed', {exact: true})).toHaveCount(0);
});

test('the status page shows the AI model apart from the protocol', async ({page}) => {
  await page.route('**/v1/status', (route) => json(route, 200, statusWith(LIMITED)));
  await page.goto('/status');
  const card = page.getByRole('region', {name: 'AI model'});
  await expect(card).toContainText('daily quota used up');
  await expect(card).toContainText('Escrow, settlement and reputation do not depend on it');
  await expect(page.getByText(/All systems operational|operational/i).first()).toBeVisible();
});
