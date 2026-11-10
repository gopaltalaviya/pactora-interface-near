import {mkdirSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {
  apiFetch,
  apiPerson,
  apiRaw,
  apiSession,
  callAs,
  chainView,
  depositInto,
  eventually,
  facts,
  newAccount,
  personAction,
  svc,
  type ApiPerson,
} from './live';

/**
 * The demo video, recorded on the REAL stack (playwright.tour.config.ts has
 * the recipe): the API, signer, indexer and notifier of pactora-backend-near
 * on the local near-sandbox, and this app's production build. Every sign-in
 * is a NEP-413 signature the API verifies and every on-chain step is a
 * transaction that lands on the sandbox, signed by the stack's wallet service
 * with the test account's own key (the same hook as live.spec.ts, so no
 * wallet window appears; the captions say so).
 *
 * One page, one continuous capture. The user is switched in place: the
 * wallet hook reads the account from localStorage, and the session is
 * dropped and signed again on /signin. Waits for the chain are marked as
 * segments to speed up (and setup-only waits to cut) in the encoding; the
 * captions carry their own capture times, so the VTT is made from the
 * recording itself.
 *
 * The agent run replays the committed model recordings (AGENT_MODE=cached),
 * which name the agents by id, so it must be the first thing the stack's
 * fresh database sees: the orchestrator and its three workers are registered
 * first, and nothing else is until the run is over.
 */

test.skip(!process.env['TOUR'], 'records the demo video: TOUR=1 (see playwright.tour.config.ts)');
test.describe.configure({mode: 'serial'});

const OUT = resolve(process.env['TOUR_OUT'] ?? 'test-results/tour');
const FRAMES = join(OUT, 'frames');
const BACKEND = resolve(process.env['TOUR_BACKEND_DIR'] ?? join(__dirname, '../../pactora-backend-near'));
const GOAL = 'Research ETH/USDC liquidity on NEAR and tell me whether to open a position.';
const DAY = 86_400_000;
/** Account names are unique per take, so a rehearsal can run again on the same stack. */
const TAG = Date.now().toString(36).slice(-4);
const PRICE = '50000';
const NEAR = 10n ** 24n;
const SANCTIONED = 'Ivan Petrovich Sanctionov';
const CRITERIA = 'Both shop fronts and their signs are in the photos, in focus.';

// ── the agents of the run (scripts/demo.mjs, byte for byte: the recordings key on these) ──

interface WorkerSpec {
  name: string;
  capability: string;
  price: string;
  role: string;
}
const WORKERS: WorkerSpec[] = [
  {
    name: 'Market Research',
    capability: 'market-research',
    price: '20000',
    role: 'a market research agent reporting on liquidity with concrete figures',
  },
  {
    name: 'Trade Analysis',
    capability: 'trade-analysis',
    price: '50000',
    role: 'a trading analysis agent that recommends a position with explicit risks',
  },
  {
    name: 'Trade Execution',
    capability: 'trade-execution',
    price: '60000',
    role: 'an execution planning agent that produces an ordered plan with an abort condition',
  },
];

interface RegisteredAgent {
  owner: string;
  agentId: string;
  chainAgentId: string;
  apiKey: string;
  wallet: string;
}

/** An agent registered as the website does it, without the page: wallet key, sub-account, register_agent, NEP-413, POST /v1/agents. */
async function registerAgent(
  label: string,
  name: string,
  capability: string,
  price: string,
  musdc: bigint,
): Promise<RegisteredAgent> {
  const owner = await newAccount(`${TAG}-${label}`, {near: '6', musdc});
  const wallet = `bot.${owner}`;
  const {walletPublicKey} = (await apiFetch('/v1/agents/wallet-key', {
    method: 'POST',
    body: {walletAddress: wallet, chainId: facts.chainId},
  })) as {walletPublicKey: string};
  await svc('/send', {
    signerId: owner,
    transactions: [
      {
        receiverId: wallet,
        actions: [
          {type: 'CreateAccount'},
          {type: 'Transfer', params: {deposit: String((2n * NEAR) / 10n)}},
          {
            type: 'AddKey',
            params: {
              publicKey: walletPublicKey,
              accessKey: {
                permission: {receiverId: facts.pactora, methodNames: [], allowance: String(NEAR / 4n)},
              },
            },
          },
        ],
      },
    ],
  });
  const chainAgentId = String(
    await callAs<number | string>(
      owner,
      facts.pactora,
      'register_agent',
      {wallet, card_uri: `data:,${encodeURIComponent(name)}`},
      {deposit: NEAR / 10n},
    ),
  );
  const ch = (await apiFetch('/v1/agents/challenge', {
    method: 'POST',
    body: {ownerAddress: owner, walletAddress: wallet, chainAgentId, chainId: facts.chainId},
  })) as {nonce: string; message: string; recipient: string};
  const signed = await svc<{publicKey: string; signature: string}>('/sign-message', {
    accountId: owner,
    message: ch.message,
    recipient: ch.recipient,
    nonce: Array.from(Buffer.from(ch.nonce, 'hex')),
  });
  const agent = (await apiFetch('/v1/agents', {
    method: 'POST',
    body: {
      name,
      capabilities: [capability],
      pricePerTask: price,
      walletAddress: wallet,
      ownerAddress: owner,
      chainId: facts.chainId,
      chainAgentId,
      nonce: ch.nonce,
      publicKey: signed.publicKey,
      signature: signed.signature,
    },
  })) as {agentId: string | number; apiKey: string};
  await eventually(
    () => chainView<{wallet: string | null}>('get_agent', {agent_id: Number(chainAgentId)}),
    (a) => a?.wallet === wallet,
    `${name}: wallet accepted on chain`,
  );
  return {owner, agentId: String(agent.agentId), chainAgentId, apiKey: agent.apiKey, wallet};
}

// ── the workers, in this process (the backend's own worker runtime) ──────

interface WorkerRuntime {
  Worker: new (opts: Record<string, unknown>) => {
    run(o: {intervalMs: number; signal: AbortSignal}): Promise<void>;
  };
  buildBrain(opts: {role: string; cacheDir: string; env: Record<string, string | undefined>}): unknown;
  confidence(): unknown;
}
interface Zod {
  z: {
    object(shape: Record<string, unknown>): unknown;
    string(): {min(n: number): {max(n: number): unknown} & unknown};
    array(t: unknown): {min(n: number): {max(n: number): unknown}};
    enum(v: string[]): unknown;
  };
}

async function startWorkers(agents: RegisteredAgent[], signal: AbortSignal) {
  const load = async <T>(path: string) => (await import(pathToFileURL(path).href)) as T;
  const core = await load<WorkerRuntime>(join(BACKEND, 'packages/agent-core/dist/index.js'));
  const {PactoraClient} = await load<{PactoraClient: new (o: Record<string, unknown>) => unknown}>(
    join(BACKEND, 'packages/sdk/dist/index.js'),
  );
  const {z} = await load<Zod>(createRequire(join(BACKEND, 'package.json')).resolve('zod'));
  const s = z.string();
  const outputs = [
    z.object({
      summary: s.min(40).max(1_200),
      keyFindings: z.array(z.string().min(10)).min(1).max(5),
      confidence: core.confidence(),
    }),
    z.object({
      recommendation: z.enum(['buy', 'sell', 'hold']),
      rationale: z.string().min(40).max(1_000),
      confidence: core.confidence(),
      risks: z.array(z.string().min(10)).min(1).max(4),
    }),
    z.object({
      steps: z
        .array(z.object({action: z.string().min(5)}))
        .min(1)
        .max(6),
      preconditions: z.array(z.string().min(5)).min(1).max(5),
      abortIf: z.string().min(10),
    }),
  ];
  const env = {...process.env, AGENT_MODE: 'cached', AGENT_REPLAY_MAX_MS: '2500'};
  return WORKERS.map((w, i) =>
    new core.Worker({
      client: new PactoraClient({baseUrl: facts.api, apiKey: agents[i]!.apiKey, chainId: facts.chainId}),
      brain: core.buildBrain({role: 'worker', cacheDir: join(BACKEND, '.agent-cache'), env}),
      capability: w.capability,
      role: w.role,
      output: outputs[i],
      log: () => undefined,
    })
      .run({intervalMs: 700, signal})
      .catch(() => undefined),
  );
}

// ── the recording ────────────────────────────────────────────────────────

const captions: {t: number; text: string}[] = [];
const segments: {start: number; end: number; speed: number | 'cut'; label: string}[] = [];
let current = '';
let page: Page;

/** A caption from now until the next one; then hold so it can be read. */
async function say(text: string, holdMs = 3_500) {
  captions.push({t: Date.now(), text});
  await page.waitForTimeout(holdMs);
}
/** A stretch of waiting (the chain, the indexer) shown faster in the video. */
async function fast<T>(label: string, fn: () => Promise<T>, speed = 4): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    segments.push({start, end: Date.now(), speed, label});
  }
}
/** Setup only (nothing on screen changes): left out of the video. */
async function cut<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    segments.push({start, end: Date.now(), speed: 'cut', label});
  }
}

/** Become `account` in the same tab: drop the session, then sign in for real on /signin. */
async function becomeUser(account: string) {
  await page.evaluate((a) => {
    sessionStorage.clear();
    localStorage.setItem('__tourAccount', a);
  }, account);
  current = account;
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toHaveText(account, {timeout: 30_000});
}

async function signOutAll() {
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.removeItem('__tourAccount');
  });
  current = '';
}

/** Scroll an element into the middle of the screen, gently. */
async function show(locator: ReturnType<Page['locator']>) {
  await locator.first().evaluate((e) => e.scrollIntoView({block: 'center', behavior: 'smooth'}));
  await page.waitForTimeout(700);
}

async function scrollBy(dy: number, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
}

const chainState = (chainJobId: string) =>
  chainView<{state: string}>('get_job', {job_id: Number(chainJobId)}).then((j) => j.state);

function listingBody(title: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    description: 'Photograph the bakery and the florist on Main Street, in daylight, from across the road.',
    category: 'physical',
    interactionMode: 'capture',
    skills: ['shop-photos'],
    location: 'Berlin',
    maxPriceBaseUnits: PRICE,
    maxWorkers: 1,
    estimatedMinutes: 30,
    deadline: new Date(Date.now() + DAY).toISOString(),
    criteria: CRITERIA,
    ...extra,
  };
}

/** A small "shop front" photo for the evidence step, drawn in an unrecorded page. */
async function shopPhoto(): Promise<Buffer> {
  const p = await page
    .context()
    .browser()!
    .newPage({viewport: {width: 640, height: 400}});
  await p.setContent(`<body style="margin:0;background:#cfe3f5">
    <div style="position:absolute;left:40px;top:70px;width:260px;height:300px;background:#b5651d"></div>
    <div style="position:absolute;left:60px;top:90px;width:220px;height:46px;background:#fff3d6;font:bold 28px sans-serif;color:#5a2d0c;text-align:center;line-height:46px">BAKERY</div>
    <div style="position:absolute;left:70px;top:170px;width:90px;height:200px;background:#5a2d0c"></div>
    <div style="position:absolute;left:180px;top:170px;width:100px;height:110px;background:#ffe9a8"></div>
    <div style="position:absolute;left:340px;top:90px;width:260px;height:280px;background:#3d7a4f"></div>
    <div style="position:absolute;left:360px;top:110px;width:220px;height:46px;background:#f0fff2;font:bold 28px sans-serif;color:#1f4d2c;text-align:center;line-height:46px">FLORIST</div>
    <div style="position:absolute;left:370px;top:190px;width:200px;height:120px;background:#ffd1dc"></div>
    <div style="position:absolute;left:0;top:370px;width:640px;height:30px;background:#777"></div></body>`);
  const buf = await p.screenshot({type: 'png'});
  await p.close();
  return buf;
}

test('the demo video: every flow on the local NEAR chain', async ({browser}) => {
  mkdirSync(FRAMES, {recursive: true});
  const stop = new AbortController();

  // ── setup before the camera: the run's four agents, first on the fresh database ──
  // TOUR_SKIP_RUN=1 leaves the agent run out: for rehearsing the later scenes on a used stack.
  const run = process.env['TOUR_SKIP_RUN'] ? null : await prepareRun(stop.signal);
  const running = run?.running ?? [];

  // ── the recorded page ──────────────────────────────────────────────────
  const context = await browser.newContext({
    viewport: {width: 1280, height: 720},
    deviceScaleFactor: 1.5,
    baseURL: `http://127.0.0.1:${process.env['LIVE_WEB_PORT'] ?? 3188}`,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  await context.exposeFunction(
    '__liveSignMessage',
    (p: {message: string; recipient: string; nonce: number[]; signerId?: string}) =>
      svc('/sign-message', {
        accountId: p.signerId || current,
        message: p.message,
        recipient: p.recipient,
        nonce: p.nonce,
      }),
  );
  await context.exposeFunction('__liveSend', (p: {signerId?: string; transactions: unknown[]}) =>
    svc('/send', {signerId: p.signerId || current, transactions: p.transactions}),
  );
  await context.addInitScript(() => {
    type W = {
      __txs: unknown[];
      __pactoraTestWallet: unknown;
      __liveSignMessage: (p: unknown) => Promise<unknown>;
      __liveSend: (p: unknown) => Promise<unknown[]>;
    };
    const w = window as unknown as W;
    const who = () => localStorage.getItem('__tourAccount') ?? '';
    w.__txs = [];
    w.__pactoraTestWallet = {
      get accountId() {
        return who();
      },
      wallet: {
        getAccounts: async () => [{accountId: who()}],
        signMessage: async (p: {message: string; recipient: string; nonce: Uint8Array; signerId?: string}) =>
          w.__liveSignMessage({
            message: p.message,
            recipient: p.recipient,
            nonce: Array.from(p.nonce),
            signerId: p.signerId,
          }),
        signAndSendTransactions: async (p: {signerId?: string; transactions: unknown[]}) => {
          w.__txs.push(...p.transactions);
          return w.__liveSend({signerId: p.signerId, transactions: p.transactions});
        },
      },
    };
  });
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let frames = 0;
  cdp.on('Page.screencastFrame', (f: {data: string; sessionId: number; metadata: {timestamp?: number}}) => {
    const ms = Math.round((f.metadata.timestamp ?? Date.now() / 1000) * 1000);
    writeFileSync(
      join(FRAMES, `${ms}-${String(frames++).padStart(6, '0')}.jpg`),
      Buffer.from(f.data, 'base64'),
    );
    void cdp.send('Page.screencastFrameAck', {sessionId: f.sessionId}).catch(() => undefined);
  });

  const save = () => {
    writeFileSync(join(OUT, 'captions.json'), JSON.stringify(captions, null, 2));
    writeFileSync(join(OUT, 'segments.json'), JSON.stringify(segments, null, 2));
  };

  try {
    await page.goto('/');
    await expect(page.getByRole('heading', {level: 1})).toBeVisible();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 88,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });
    captions.push({t: Date.now(), text: ''});
    await page.waitForTimeout(800);

    // ── 0. what this is ────────────────────────────────────────────────
    await say(
      'Pactora: AI agents and people hire each other, pay through escrow on NEAR, and earn a reputation only a settled payment can write.',
      5_000,
    );
    await say(
      'Everything you see is real, on a local NEAR sandbox: the Pactora contract, API, signer and indexer. Test accounts, test tokens.',
      5_000,
    );
    await say(
      'A test wallet signs each step with the account’s own key, so no wallet window opens in this recording. Every transaction lands on chain.',
      5_000,
    );

    // ── 1. agent → agent ───────────────────────────────────────────────
    if (run) {
      const {orchestrator} = run;
      await page.goto('/agents');
      await expect(page.getByText('Market Research').first()).toBeVisible();
      await say(
        '1 · Agent → agent. Three worker agents are listed, each registered on chain with a stake. An orchestrator agent will hire them.',
        4_500,
      );
      await page.goto('/demo');
      await expect(page.getByRole('heading', {level: 1})).toBeVisible();
      await page.waitForTimeout(600);
      const form = page.getByRole('button', {name: `Use example: ${GOAL}`});
      await show(form);
      await say(
        'The orchestrator gets one sentence. Its API key is used for this request only, and it spends under its own on-chain caps.',
        3_000,
      );
      await form.click();
      await page.getByLabel('Orchestrator API key').fill(orchestrator.apiKey);
      await page.waitForTimeout(800);
      await page.getByRole('button', {name: 'Run', exact: true}).click();
      // The run's badge (live, finished or failed), not the other live regions in the card.
      const status = page.getByRole('region', {name: 'This run'}).locator('span.ml-auto[role="status"]');
      await expect(status).toContainText(/live|finished/, {timeout: 60_000});
      await say(
        'It plans the work, discovers agents by skill and record, and hires each one into escrow on NEAR.',
        4_000,
      );
      await show(page.getByRole('region', {name: 'This run'}));
      await say(
        'AI answers here are replayed from a recording (cached mode, no AI quota); every hire, payment and settlement is a real transaction.',
        4_000,
      );
      await fast(
        'agent run',
        async () => {
          const end = Date.now() + 240_000;
          while (Date.now() < end) {
            if (/finished|failed/.test((await status.textContent()) ?? '')) break;
            // Keep the newest trace line in view.
            await page
              .getByRole('region', {name: 'This run'})
              .evaluate((r) => {
                const items = r.querySelectorAll('li');
                items[items.length - 1]?.scrollIntoView({block: 'center', behavior: 'smooth'});
              })
              .catch(() => undefined);
            await page.waitForTimeout(1_200);
          }
        },
        5,
      );
      await expect(status).toContainText('finished', {timeout: 10_000});
      await page.waitForTimeout(800);
      await say(
        'Each result is judged before it is paid. Approved work settles, and only then is a review written to the worker’s on-chain record.',
        4_500,
      );
      await page.getByRole('link', {name: /Open the shareable record/}).click();
      await expect(page).toHaveURL(/\/runs\//);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await say(
        'The run record is public: the full trace, each verdict, and the settlement transaction under every paid step.',
        4_000,
      );
      await scrollBy(500);
      await page.waitForTimeout(1_500);
      await scrollBy(500);
      await page.waitForTimeout(1_500);
    }

    // ── setup for the rest (after the run, so the recordings still matched) ─
    const prep = await cut('setup: people and agents', async () => {
      await page.goto('/');
      const atlas = await registerAgent('atlas', 'Atlas Scout', 'shop-photos', PRICE, 20_000_000n);
      await depositInto(atlas.owner, atlas.chainAgentId, 1_000_000n, 'Fund');
      await depositInto(atlas.owner, atlas.chainAgentId, BigInt(facts.minStake) + 1_000_000n, 'Stake');
      const stake = BigInt(facts.minStake) + 1_000_000n;
      const wanda = await apiPerson(`${TAG}-wanda`, 'Wanda Okafor', {stake, musdc: stake});
      const carl = await apiPerson(`${TAG}-carl`, 'Carl Mendes', {musdc: 5_000_000n, fund: 2_000_000n});
      const sam = await apiPerson(`${TAG}-sam`, 'Sam Quick', {musdc: 2_000_000n, fund: 1_000_000n});
      const holly = await apiPerson(`${TAG}-holly`, 'Holly Brandt');
      const council = [
        await newAccount(`${TAG}-council1`, {near: '3'}),
        await newAccount(`${TAG}-council2`, {near: '3'}),
        await newAccount(`${TAG}-council3`, {near: '3'}),
      ];
      const listing = (await apiFetch('/v1/listings', {
        method: 'POST',
        token: atlas.apiKey,
        headers: {'idempotency-key': `tour-atlas-${facts.run}-${TAG}`},
        body: listingBody('Photograph two shop fronts on Main Street'),
      })) as {listingId: string};
      return {atlas, wanda, carl, sam, holly, council, listingId: listing.listingId};
    });
    const {atlas, wanda, carl, sam, holly, council} = prep;
    // The dispute's job, Carl hires Wanda, driven to Submitted in the background (real transactions).
    const disputeJob = disputeSetup(carl, wanda);
    disputeJob.catch(() => undefined);

    // ── 2. agent → person ──────────────────────────────────────────────
    await page.goto('/jobs');
    await expect(page.getByText('Photograph two shop fronts on Main Street').first()).toBeVisible();
    await say(
      '2 · Agent → person. The agent Atlas Scout posted this listing through its API key, with a price ceiling and criteria.',
      4_500,
    );
    await becomeUser(wanda.account);
    await say(
      'Wanda, a person with her own NEAR account, signs in with one signed message, no transaction.',
      3_500,
    );
    await page.goto(`/jobs/listing/${prep.listingId}`);
    await expect(
      page.getByRole('heading', {name: 'Photograph two shop fronts on Main Street'}),
    ).toBeVisible();
    await page.locator('#bid-price').fill('0.05');
    await page
      .locator('#bid-proposal')
      .fill('I work on Main Street and can photograph both fronts within the hour.');
    await say('She bids her price.', 2_000);
    await page.getByRole('button', {name: 'Send my bid'}).click();
    await expect(page.getByTestId('my-bid')).toContainText('pending');
    await page.waitForTimeout(1_200);
    const apps = (await apiFetch(`/v1/listings/${prep.listingId}/applications`, {token: atlas.apiKey})) as {
      applications: {applicationId: string; applicant: {name: string}}[];
    };
    const mine = apps.applications.find((a) => a.applicant.name === wanda.name)!;
    await say(
      'The agent selects her through the API. Its signer funds the job from the agent’s purse: the payment is now locked in escrow.',
      2_000,
    );
    const decided = (await apiFetch(`/v1/listings/${prep.listingId}/decide`, {
      method: 'POST',
      token: atlas.apiKey,
      body: {applicationId: mine.applicationId, action: 'select', reason: 'Works on the street, clear plan.'},
    })) as {job: {jobId: string}};
    const agJob = decided.job.jobId;
    const agChain = await fast('agent funds the job', async () => {
      const j = await eventually(
        async () => (await apiFetch(`/v1/jobs/${agJob}`)) as {chainJobId: string | null},
        (x) => Boolean(x.chainJobId),
        'agent-funded job on chain',
        90_000,
      );
      return j.chainJobId!;
    });
    await page.goto(`/jobs/${agJob}`);
    await expect(page.getByText('You are the worker').first()).toBeVisible();
    await say('On the job page she accepts. Accepting is her own transaction, and it locks her bond.', 2_500);
    await page.getByRole('button', {name: 'Accept the job'}).click();
    await fast('accept', async () => {
      await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
      await eventually(
        () => chainState(agChain),
        (st) => st === 'Accepted',
        'accepted',
      );
    });
    await page.reload();
    await page.locator('#photo-input').setInputFiles({
      name: 'main-street.png',
      mimeType: 'image/png',
      buffer: await shopPhoto(),
    });
    await expect(page.getByRole('list', {name: 'Photos'}).getByRole('listitem')).toHaveCount(1);
    await show(page.getByRole('list', {name: 'Photos'}));
    await say('She uploads the photo as evidence and posts a draft for the agent to check.', 2_500);
    await page.locator('#draft-text').fill('Both fronts, from across the road, signs in focus.');
    await page.getByRole('button', {name: 'Post draft 1'}).click();
    await expect(page.getByTestId('draft-1')).toBeVisible();
    await page.waitForTimeout(1_000);
    const drafts = (await apiFetch(`/v1/jobs/${agJob}/drafts`, {token: atlas.apiKey})) as {
      drafts: {draftId: string; snapshotHash: string}[];
    };
    await apiFetch(`/v1/jobs/${agJob}/drafts/${drafts.drafts[0]!.draftId}/review`, {
      method: 'POST',
      token: atlas.apiKey,
      body: {
        snapshotHash: drafts.drafts[0]!.snapshotHash,
        decision: 'accept_draft',
        reason: 'Both fronts and both signs are clear.',
        checks: [{criterion: CRITERIA, met: true, support: 'draft 1 photo'}],
      },
    });
    await page.reload();
    const submit = page.getByRole('button', {name: 'Sign and submit the accepted draft'});
    await show(submit);
    await say(
      'The agent accepts the draft through the API. Wanda submits exactly that version on chain, by its hash.',
      2_500,
    );
    await submit.click();
    await fast('submit and settle', async () => {
      await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
      await eventually(
        () => chainState(agChain),
        (st) => st === 'Submitted' || st === 'Settled',
        'submitted',
      );
      const approve = await apiRaw(`/v1/jobs/${agJob}/approve`, {
        method: 'POST',
        token: atlas.apiKey,
        body: {},
      });
      expect([200, 202, 409]).toContain(approve.status);
      await eventually(
        () => chainState(agChain),
        (st) => st === 'Settled',
        'settled',
        90_000,
      );
      await eventually(
        async () => ((await apiFetch(`/v1/jobs/${agJob}`)) as {state: string}).state,
        (st) => st === 'settled',
        'indexed',
      );
    });
    await page.reload();
    await expect(page.locator('header').getByText('Settled', {exact: true}).first()).toBeVisible();
    await say('The agent approves and the escrow pays Wanda, less the 1% protocol fee. Settled.', 3_500);
    await show(page.getByRole('region', {name: 'History'}));
    await say(
      'The job’s history is read from the chain: created, accepted, submitted, settled, each with its transaction.',
      4_000,
    );

    // ── 3. person → agent: direct hire ─────────────────────────────────
    await becomeUser(carl.account);
    await page.goto(`/agents/${atlas.agentId}`);
    const card = page.getByRole('region', {name: 'Hire this agent'});
    await expect(card).toBeVisible();
    await show(card);
    await say(
      '3 · Person → agent. Carl hires Atlas Scout directly from its page, at its listed price.',
      3_500,
    );
    await card
      .getByLabel('What should the agent do?')
      .fill('Photograph the bakery front on Main Street at opening time.');
    await card.getByRole('button', {name: 'Hire'}).click();
    await expect(card.getByTestId('will-sign-create')).toContainText('create_job');
    await say(
      'Before anything is signed, the page says exactly what the wallet will sign: create_job on the Pactora contract.',
      3_500,
    );
    await card.getByRole('button', {name: 'Sign and fund the job'}).click();
    await fast('direct hire funds', async () => {
      await expect(card.getByTestId('hire-funded')).toContainText('Funded', {timeout: 90_000});
    });
    await page.waitForTimeout(800);
    const dhJob = (await card.getByRole('link', {name: 'Open the job'}).getAttribute('href'))!
      .split('/')
      .pop()!;
    const dhChain = (
      await eventually(
        async () => (await apiFetch(`/v1/jobs/${dhJob}`)) as {chainJobId: string | null},
        (j) => Boolean(j.chainJobId),
        'direct hire on chain',
      )
    ).chainJobId!;
    await say(
      'The agent accepts and delivers through its API key; its signer signs for the agent’s wallet.',
      2_000,
    );
    await fast('agent delivers', async () => {
      await apiFetch(`/v1/jobs/${dhJob}/accept`, {method: 'POST', token: atlas.apiKey, body: {}});
      await eventually(
        () => chainState(dhChain),
        (st) => st === 'Accepted',
        'accepted',
      );
      await apiFetch(`/v1/jobs/${dhJob}/result`, {
        method: 'POST',
        token: atlas.apiKey,
        body: {
          output: {photo: 'bakery-front.jpg', note: 'Sign in focus, door open.'},
          producedAt: new Date().toISOString(),
        },
      });
      await eventually(
        () => chainState(dhChain),
        (st) => st === 'Submitted',
        'submitted',
      );
      await expect(async () => {
        await page.goto(`/jobs/${dhJob}`);
        await expect(page.getByRole('button', {name: 'Approve and pay'})).toBeVisible({timeout: 5_000});
      }).toPass({timeout: 60_000, intervals: [2_000]});
    });
    await show(page.getByRole('button', {name: 'Approve and pay'}));
    await say(
      'Carl reviews the result and approves. Had he stayed silent, the review window would have paid the agent anyway.',
      2_000,
    );
    await page.getByRole('button', {name: 'Approve and pay'}).click();
    await fast('approve', async () => {
      await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
      await eventually(
        () => chainState(dhChain),
        (st) => st === 'Settled',
        'settled',
      );
      await eventually(
        async () => ((await apiFetch(`/v1/jobs/${dhJob}`)) as {state: string}).state,
        (st) => st === 'settled',
        'indexed',
      );
    });
    await page.reload();
    await expect(page.locator('header').getByText('Settled', {exact: true}).first()).toBeVisible();
    await say('Settled on chain, and Atlas Scout’s record now counts one more paid job.', 3_500);

    // ── 4. person → person, and a dispute the DAO council rules ─────────
    // The sandbox's review window is 10 s, so Wanda submits just before Carl disputes.
    const dj = await cut('dispute job: Wanda submits', async () => {
      const ready = await disputeJob;
      await personAction(wanda.token, wanda.account, ready.jobId, 'submit');
      await page.goto(`/jobs/${ready.jobId}`);
      await expect(page.getByRole('button', {name: 'Dispute the result'})).toBeVisible();
      return ready;
    });
    await say(
      '4 · Person → person, and a dispute. Carl hired Wanda for a second photo; she delivered, and he thinks it shows the wrong shop.',
      2_500,
    );
    await page.getByRole('button', {name: 'Dispute the result'}).click();
    await page
      .locator('#job-reason')
      .fill('The photo shows the wrong shop: the sign is the pharmacy next door.');
    await page.getByRole('button', {name: 'Sign and dispute'}).click();
    await fast('dispute', async () => {
      await expect(page.getByTestId('action-done')).toBeVisible({timeout: 90_000});
      await eventually(
        () => chainState(dj.chainJobId),
        (st) => st === 'Disputed',
        'disputed',
      );
    });
    await say(
      'Disputed on chain, inside the review window. Carl’s bond is returned unless the ruling goes against him; the 0.05 mUSDC stays in escrow.',
      4_500,
    );
    await page.waitForTimeout(1_000);
    await cut('the DAO becomes the arbiter', () => svc('/dao', {members: council}));
    try {
      await becomeUser(council[0]!);
      await say(
        'The arbiter is a Sputnik DAO: a council of three, two of whom must agree. Here, a council member signs in.',
        3_000,
      );
      await fast('council cache', async () => {
        await expect(async () => {
          await page.goto('/admin');
          await expect(page.getByTestId('admin-roles')).toContainText('Arbiter council', {timeout: 5_000});
        }).toPass({timeout: 90_000, intervals: [2_000, 5_000]});
      });
      await page.getByRole('button', {name: `Job ${dj.chainJobId}`}).click();
      await expect(page.getByTestId('dispute-reason')).toContainText('pharmacy next door');
      await show(page.getByTestId('dispute-reason'));
      await say(
        'The dispute desk shows Carl’s reason and the evidence. The member proposes a ruling to the DAO: refund the client.',
        3_500,
      );
      await page.getByRole('button', {name: 'Propose: refund the client'}).click();
      await fast('proposal', async () => {
        await expect(page.getByTestId('desk-notice')).toContainText('Proposed to the DAO', {timeout: 90_000});
      });
      const proposals = await eventually(
        async () =>
          (await apiFetch(`/v1/admin/disputes/${dj.jobId}/proposals`, {
            token: await apiSession(council[0]!),
          })) as {proposals: {id: number; status: string}[]},
        (p) => p.proposals.some((x) => x.status === 'InProgress'),
        'proposal on the DAO',
      );
      const pid = proposals.proposals.find((p) => p.status === 'InProgress')!.id;
      await page.goto('/admin');
      await page.getByRole('button', {name: `Job ${dj.chainJobId}`}).click();
      const row = page.getByTestId(`proposal-${pid}`);
      await show(row);
      await say('One vote is not enough.', 1_500);
      await row.getByRole('button', {name: 'Approve'}).click();
      await fast('vote 1', async () => {
        await expect(row).toContainText('You voted', {timeout: 90_000});
      });
      expect(await chainState(dj.chainJobId)).toBe('Disputed');
      await say('After the first vote the job is still Disputed on chain.', 3_000);
      await becomeUser(council[1]!);
      await page.goto('/admin');
      await page.getByRole('button', {name: `Job ${dj.chainJobId}`}).click();
      const row2 = page.getByTestId(`proposal-${pid}`);
      await show(row2);
      await say('A second member approves, and the DAO itself calls the Pactora contract to rule.', 2_500);
      await row2.getByRole('button', {name: 'Approve'}).click();
      await fast('vote 2 and ruling', async () => {
        await expect(page.getByTestId('desk-notice')).toBeVisible({timeout: 90_000});
        await eventually(
          () => chainState(dj.chainJobId),
          (st) => st === 'Refunded',
          'ruled',
          90_000,
        );
        await eventually(
          async () => ((await apiFetch(`/v1/jobs/${dj.jobId}`)) as {state: string}).state,
          (st) => /refund/i.test(st),
          'indexed',
        ).catch(() => undefined);
      });
      await page.goto(`/jobs/${dj.jobId}`);
      await expect(page.getByText(/Refunded/i).first())
        .toBeVisible()
        .catch(() => undefined);
      await say(
        'Ruled: Carl is refunded from escrow. The ruling is the DAO’s on-chain decision, not an operator’s.',
        4_000,
      );
    } finally {
      await svc('/dao/restore');
    }

    // ── 5. trust and safety ────────────────────────────────────────────
    const spamTitle = 'Easy money: pay a small fee to start';
    const spam = await cut(
      'a listing to report',
      async () =>
        (await apiFetch('/v1/listings', {
          method: 'POST',
          token: sam.token,
          headers: {'idempotency-key': `tour-spam-${facts.run}-${TAG}`},
          body: listingBody(spamTitle, {
            description: 'Send a small fee to my account first and I will give you the job details.',
          }),
        })) as {listingId: string},
    );
    await becomeUser(carl.account);
    await page.goto(`/jobs/listing/${spam.listingId}`);
    await expect(page.getByRole('heading', {name: spamTitle})).toBeVisible();
    await say('5 · Trust and safety. Anyone can report a listing, a profile, an agent or a message.', 3_000);
    await page.getByRole('button', {name: 'Report', exact: true}).first().click();
    const reportForm = page.getByRole('form', {name: 'Report this listing'});
    await show(reportForm);
    await reportForm.getByLabel(/Why are you reporting/).selectOption('scam');
    await reportForm
      .getByLabel('Details (optional)')
      .fill('Asks bidders to pay a fee first, off the platform.');
    await reportForm.getByRole('button', {name: 'Send the report'}).click();
    await expect(page.getByTestId('report-sent')).toBeVisible();
    await page.waitForTimeout(1_500);
    await becomeUser(facts.reviewers[0]!);
    await page.goto('/admin');
    await expect(page.getByTestId('admin-roles')).toContainText('Compliance reviewer');
    await page.getByRole('tab', {name: 'Reports'}).click();
    const item = page
      .getByRole('list', {name: 'Reports'})
      .getByRole('listitem')
      .filter({hasText: spam.listingId});
    await expect(item).toContainText('scam');
    await show(item);
    await say('A compliance reviewer sees the report on /admin and can hide, warn, block or dismiss.', 3_000);
    await item.getByRole('button', {name: 'Block', exact: true}).click();
    await item.getByLabel('Note (3-500 characters)').fill('Fee-first scam, confirmed from the listing text.');
    await item.getByRole('button', {name: 'Confirm: Block'}).click();
    await expect(item).toHaveCount(0);
    await say(
      'Blocked: the poster can no longer post or bid, and the listing leaves the public board.',
      3_500,
    );

    await becomeUser(holly.account);
    await page.goto('/me#settings');
    const kyc = page.locator('#kyc-name');
    await expect(kyc).toBeVisible();
    await show(kyc);
    await say(
      'Before working, a person can take an identity check: the legal name is screened against the sanctions lists (a simulated provider on test chains).',
      3_000,
    );
    await kyc.fill(SANCTIONED);
    await page.getByRole('button', {name: 'Start the identity check'}).click();
    await expect(page.getByTestId('standing')).toContainText('On hold');
    await show(page.getByTestId('standing'));
    await say(
      'A strong match puts the account on hold: no posting, no bidding, until two compliance reviewers clear it.',
      4_500,
    );

    // ── 6. status ──────────────────────────────────────────────────────
    await signOutAll();
    await page.goto('/status');
    await expect(page.getByText(/operational/i).first()).toBeVisible();
    await say(
      '6 · The public status page: API, database, signer, chain connection and indexer lag, live.',
      4_500,
    );
    await page.goto('/');
    await expect(page.getByRole('heading', {level: 1})).toBeVisible();
    await say(
      'Pactora: escrow and reputation for agents and people, on NEAR. Testnet only, test tokens. The code is open source.',
      5_000,
    );
    captions.push({t: Date.now(), text: ''});
    await page.waitForTimeout(500);
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => undefined);
    save();
    stop.abort();
    await Promise.allSettled(running);
    await context.close();
  }
});

/** The run's four agents, first on the fresh database, funded and staked; their workers started. */
async function prepareRun(signal: AbortSignal) {
  const existing = (await apiFetch('/v1/agents')) as {agents: unknown[]};
  expect(existing.agents, 'the stack must be fresh: the recorded run names agent ids 1-4').toHaveLength(0);
  const orchestrator = await registerAgent('orch', 'Orchestrator', 'orchestration', '0', 3_000_000n);
  expect(orchestrator.agentId).toBe('1');
  const workers: RegisteredAgent[] = [];
  for (const w of WORKERS) {
    workers.push(
      await registerAgent(w.capability, w.name, w.capability, w.price, BigInt(facts.minStake) + 2_000_000n),
    );
  }
  await depositInto(orchestrator.owner, orchestrator.chainAgentId, 2_000_000n, 'Fund');
  for (const w of workers)
    await depositInto(w.owner, w.chainAgentId, BigInt(facts.minStake) + 1_000_000n, 'Stake');
  const running = await startWorkers(workers, signal);
  return {orchestrator, running};
}

/** Carl hires Wanda through a listing; she accepts and he accepts her draft. Every step a real transaction, through the API; she submits in the scene. */
async function disputeSetup(carl: ApiPerson, wanda: ApiPerson): Promise<{jobId: string; chainJobId: string}> {
  const listing = (await apiFetch('/v1/listings', {
    method: 'POST',
    token: carl.token,
    headers: {'idempotency-key': `tour-dispute-${facts.run}-${TAG}`},
    body: listingBody('Photograph the bakery again, from the corner'),
  })) as {listingId: string};
  const application = (await apiFetch(`/v1/listings/${listing.listingId}/applications`, {
    method: 'POST',
    token: wanda.token,
    body: {action: 'apply', priceBaseUnits: PRICE, proposal: 'Same street, same light, within the hour.'},
  })) as {applicationId: string};
  const decided = (await apiFetch(`/v1/listings/${listing.listingId}/decide`, {
    method: 'POST',
    token: carl.token,
    body: {applicationId: application.applicationId, action: 'select', reason: 'Did the first one well.'},
  })) as {job: {jobId: string}};
  const jobId = decided.job.jobId;
  await personAction(carl.token, carl.account, jobId, 'create');
  await personAction(wanda.token, wanda.account, jobId, 'accept');
  const draft = (await apiFetch(`/v1/jobs/${jobId}/drafts`, {
    method: 'POST',
    token: wanda.token,
    body: {text: 'The bakery from the corner.'},
  })) as {draftId: string; snapshotHash: string};
  await apiFetch(`/v1/jobs/${jobId}/drafts/${draft.draftId}/review`, {
    method: 'POST',
    token: carl.token,
    body: {
      snapshotHash: draft.snapshotHash,
      decision: 'accept_draft',
      reason: 'Looks right at first sight.',
      checks: [{criterion: CRITERIA, met: true, support: 'draft 1'}],
    },
  });
  const chainJobId = ((await apiFetch(`/v1/jobs/${jobId}`)) as {chainJobId: string}).chainJobId;
  return {jobId, chainJobId};
}
