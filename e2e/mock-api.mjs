/**
 * A stand-in Pactora API for the smoke test: fixed responses, no database, no
 * chain. It proves the pages render, route and link correctly against the
 * API's shapes — it proves nothing about the API itself, which has its own
 * tests and the live-chain checks in pactora-backend-near/scripts.
 */
import {createServer} from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 8787);
const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const JOB_ID = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e';
const EXPLORER = 'https://testnet.nearblocks.io';
const HOSTILE = 'javascript:alert(1)';

const network = {
  // The GET /v1/network shape of NEAR-PORT §4.
  chainId: 'near:testnet',
  nearNetworkId: 'testnet',
  name: 'NEAR Testnet',
  shortName: 'near-testnet',
  testnet: true,
  paymentToken: {symbol: 'USDC', decimals: 6, accountId: 'musdc.pactora.testnet'},
  contracts: {
    Pactora: 'pactora.testnet',
    PaymentToken: 'musdc.pactora.testnet',
    Arbiter: 'arbiter.pactora.testnet',
  },
  rpcUrls: ['https://rpc.testnet.near.org'],
  nativeCurrency: {name: 'NEAR', symbol: 'NEAR', decimals: 24},
  explorerBaseUrl: EXPLORER,
  faucetUrls: [],
  enabledChains: ['near:testnet'],
  fastPathMax: '5000000',
  fastPathMaxDisplay: '5 USDC',
  protocolFeeBps: 100,
  minJobAmount: '10000',
  minFee: '100',
  windows: {accept: 600, work: 1800, review: 600, dispute: 3600},
  // Fees and limits, as pactora-contracts-near config/params.testnet.json might set them.
  bondBps: 2000,
  minBond: '10000',
  disputeBondBps: 1000,
  minDisputeBond: '10000',
  maxJobAmount: '10000000',
  defaultPerTaskCap: '100000',
  defaultDailyCap: '1000000',
  minStake: '10000000',
  withdrawDelaySeconds: 604800,
};

const agent = (agentId, name, extra = {}) => ({
  agentId,
  chainId: 'near:testnet',
  name,
  description: `${name} does research`,
  capabilities: ['market-research'],
  pricePerTask: '20000',
  priceDisplay: '0.02 USDC',
  walletAddress: `${name.toLowerCase()}.owner.testnet`,
  score: 72,
  completed: 3,
  failed: 1,
  successRate: 0.75,
  active: true,
  explorerUrl: `${EXPLORER}/address/${name.toLowerCase()}.owner.testnet`,
  ...extra,
});

const agents = [
  agent(1, 'ResearchBot', {chainAgentId: '42'}),
  // A hostile explorer URL: the page must render the agent without the link.
  agent(2, 'Unproven', {completed: 0, failed: 0, score: 50, successRate: null, explorerUrl: HOSTILE}),
];

/** Reputation per skill. ResearchBot's record in research differs from its overall one. */
const skill = (capability, completed, failed, score) => ({
  capability,
  completed,
  failed,
  successRate: completed + failed === 0 ? null : completed / (completed + failed),
  score,
});
const skills = {
  1: [skill('market-research', 2, 0, 61), skill('trade-analysis', 1, 1, 50)],
  2: [skill('market-research', 0, 0, 50)],
};

const run = {
  runId: RUN_ID,
  chainId: 'near:testnet',
  network: 'NEAR Testnet',
  testnet: true,
  goal: 'Research NEAR/USDC liquidity on NEAR',
  state: 'done',
  spent: '20000',
  spentDisplay: '0.02 USDC',
  startedAt: '2026-09-30T08:00:00.000Z',
  finishedAt: '2026-09-30T08:01:00.000Z',
  answer: 'Liquidity is thin; wait.',
  error: null,
  steps: [
    {
      capability: 'market-research',
      status: 'settled',
      detail: 'paid 0.02 USDC',
      jobId: JOB_ID,
      agentId: 1,
      explorerUrl: `${EXPLORER}/txns/6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm`,
    },
  ],
  events: [
    {
      kind: 'planned',
      payload: {subtasks: 1, reasoning: 'one research step'},
      occurredAt: '2026-09-30T08:00:01.000Z',
    },
    {
      kind: 'hired',
      payload: {
        jobId: JOB_ID,
        amount: '0.02 USDC',
        explorerUrl: `${EXPLORER}/txns/6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm`,
      },
      occurredAt: '2026-09-30T08:00:10.000Z',
    },
    {kind: 'settled', payload: {jobId: JOB_ID, explorerUrl: HOSTILE}, occurredAt: '2026-09-30T08:00:50.000Z'},
    {kind: 'finished', payload: {spent: '20000'}, occurredAt: '2026-09-30T08:01:00.000Z'},
  ],
};

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

// The shape of GET /v1/status (pactora-backend-near apps/api/src/routes/status.ts):
// one component degraded, so the page's non-happy path is what gets tested.
const status = () => ({
  status: 'degraded',
  checkedAt: new Date().toISOString(),
  build: {service: 'api', version: '0.1.0', commit: 'a1f9485c0ffe', builtAt: '2026-09-30T12:00:00Z'},
  components: {api: 'up', database: 'up', signer: 'up', rpc: 'up', indexer: 'degraded'},
  // v3: the signer's gas reading — one wallet low, so the warning is tested.
  gas: {
    state: 'low',
    checkedAt: new Date(Date.now() - 30_000).toISOString(),
    wallets: [
      {
        address: 'researchbot.owner.testnet',
        role: 'agent',
        balanceYocto: '4638165459998076677000000',
        low: false,
      },
      {address: 'd5'.repeat(32), role: 'keeper', balanceYocto: '90000000000000000000000', low: true},
    ],
  },
  chains: [
    {
      chainId: 'near:testnet',
      name: 'NEAR Testnet',
      testnet: true,
      rpc: 'up',
      headBlock: 66970500,
      indexer: {
        status: 'degraded',
        indexedBlock: 66970100,
        lagBlocks: 400,
        lastIndexedAt: new Date(Date.now() - 95_000).toISOString(),
        secondsSinceIndexed: 95,
      },
    },
  ],
});

/** Read a JSON request body (the session and people routes post one). */
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

// People: sign-in (POST /v1/session) and the person record. The token carries
// the account (ps_<account>_<random>), so parallel tests signing in as
// different accounts never share state in this server. A token starting
// `ps_expired` is always refused, to test the 401 path.
const sessionToken = (account) => `ps_${account}_${'e'.repeat(32)}`;
function sessionAccount(req) {
  const m = /^Bearer ps_([a-z0-9._-]+)_[a-z]{32}$/.exec(req.headers.authorization ?? '');
  return m && !m[1].startsWith('expired') ? m[1] : null;
}
const NONCE = 'ab'.repeat(32);

async function people(req, res, url) {
  if (url.pathname === '/v1/session/challenge' && req.method === 'POST') {
    const {accountId} = await readBody(req);
    return send(res, 201, {
      nonce: NONCE,
      message: `Pactora: sign in.
Chain: near:testnet
Account: ${accountId}
Nonce: ${NONCE}`,
      recipient: 'pactora',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  }
  if (url.pathname === '/v1/session' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.nonce !== NONCE || !body.signature)
      return send(res, 401, {code: 'UNAUTHORIZED', detail: 'bad signature'});
    return send(res, 201, {
      token: sessionToken(body.accountId),
      account: body.accountId,
      chainId: 'near:testnet',
      expiresAt: '2030-01-01T00:00:00.000Z',
      person:
        body.accountId === 'veteran.testnet' ? {publicId: 'p-9', chainAgentId: '9', name: 'Veteran'} : null,
    });
  }
  if (url.pathname === '/v1/session' || url.pathname === '/v1/sessions' || url.pathname === '/v1/people') {
    const account = sessionAccount(req);
    if (!account) return send(res, 401, {code: 'UNAUTHORIZED', detail: 'no session'});
    if (url.pathname === '/v1/session' && req.method === 'GET') {
      return send(res, 200, {
        account,
        chainId: 'near:testnet',
        expiresAt: '2030-01-01T00:00:00.000Z',
        person: account === 'veteran.testnet' ? {publicId: 'p-9', chainAgentId: '9', name: 'Veteran'} : null,
      });
    }
    if (req.method === 'DELETE') return send(res, 204, null);
    if (url.pathname === '/v1/people' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.chainAgentId === '13')
        return send(res, 409, {code: 'INVALID_STATE', detail: 'the wallet has not accepted the agent'});
      return send(res, 201, {
        publicId: 'p-new',
        chainAgentId: body.chainAgentId,
        name: body.name,
        kind: 'person',
      });
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (url.pathname.startsWith('/v1/session') || url.pathname === '/v1/people') {
    if ((await people(req, res, url)) !== null) return;
    return send(res, 404, {code: 'NOT_FOUND', detail: 'not found'});
  }
  if (url.pathname === '/v1/network') return send(res, 200, network);
  if (url.pathname === '/v1/status') return send(res, 200, status());
  if (url.pathname === '/v1/agents') {
    const capability = url.searchParams.get('capability');
    if (!capability) return send(res, 200, {agents});
    if (capability !== 'market-research') return send(res, 200, {agents: []});
    // Filtered by a skill, as the API does: each agent carries its record in it.
    return send(res, 200, {
      agents: agents.map((a) => ({...a, skill: skills[a.agentId].find((s) => s.capability === capability)})),
    });
  }
  // v3: who paid for an agent's record. ResearchBot (1) is trusted; Unproven
  // (2) has no history, so the check says new — as the real one would.
  const trustMatch = /^\/v1\/agents\/(\d+)\/trust$/.exec(url.pathname);
  if (trustMatch) {
    const id = Number(trustMatch[1]);
    if (!agents.find((a) => a.agentId === id))
      return send(res, 404, {code: 'NOT_FOUND', detail: 'no such agent'});
    const fresh = id === 2;
    return send(res, 200, {
      agentId: String(id),
      chainId: 'near:testnet',
      verdict: fresh ? 'new' : 'trusted',
      reasons: [
        fresh
          ? '0 finished job(s); at least 3 are needed to judge'
          : '14 paid jobs from 9 distinct owners; none self-funded; 7% failed',
      ],
      metrics: fresh
        ? {
            settled: 0,
            failed: 0,
            volume: '0',
            clientOwners: 0,
            topOwnerSettled: 0,
            selfFunded: 0,
            trustScore: 50,
          }
        : {
            settled: 14,
            failed: 1,
            volume: '700000',
            clientOwners: 9,
            topOwnerSettled: 3,
            selfFunded: 0,
            trustScore: 72,
          },
      fundingWindowBlocks: 9000,
      indexedToBlock: '66970100',
    });
  }
  const agentMatch = /^\/v1\/agents\/(\d+)$/.exec(url.pathname);
  if (agentMatch) {
    const found = agents.find((a) => a.agentId === Number(agentMatch[1]));
    return found
      ? send(res, 200, {...found, skills: skills[found.agentId]})
      : send(res, 404, {code: 'NOT_FOUND', detail: 'no such agent'});
  }
  if (url.pathname === `/v1/jobs/${JOB_ID}`) {
    // The API's own bookkeeping event has no transaction; the indexer's does.
    return send(res, 200, {
      jobId: JOB_ID,
      state: 'settled',
      events: [
        {kind: 'created', explorerUrl: `${EXPLORER}/txns/6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm`},
        {kind: 'job.settled', explorerUrl: null},
        {kind: 'settled', explorerUrl: `${EXPLORER}/txns/8Ha3ThYvqv4WQx2t4ZCSFmAS5hj7VG4EHVgPeLJP7tUZ`},
      ],
    });
  }
  if (url.pathname === '/v1/runs') {
    return req.headers.authorization
      ? send(res, 200, {runs: [run]})
      : send(res, 401, {code: 'UNAUTHORIZED', detail: 'missing key'});
  }
  if (url.pathname === `/v1/runs/${RUN_ID}`) return send(res, 200, run);
  return send(res, 404, {code: 'NOT_FOUND', detail: 'not found'});
}).listen(PORT, '127.0.0.1', () => process.stdout.write(`mock api on ${PORT}\n`));
