/**
 * A stand-in Pactora API for the smoke test: fixed responses, no database, no
 * chain. It proves the pages render, route and link correctly against the
 * API's shapes — it proves nothing about the API itself, which has its own
 * tests and the live-chain checks in agentx-backend/scripts.
 */
import {createServer} from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 8787);
const RUN_ID = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const JOB_ID = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e';
const EXPLORER = 'https://testnet.monadexplorer.com';
const HOSTILE = 'javascript:alert(1)';

const network = {
  chainId: 10143,
  name: 'Monad Testnet',
  testnet: true,
  paymentToken: {symbol: 'USDC', decimals: 6, address: '0x35Ca89EA58b292BF8D66eFEC2c086501a3802980'},
  contracts: {TaskEscrow: '0x4feED0338761817417Fd1dDdFC8331D16AEB370D'},
  erc8004: {identityRegistry: '0xeD34Ffc39Ee69c780586b85d930368Bc29B30ef1', referenceImplementation: true},
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  nativeCurrency: {name: 'MON', symbol: 'MON', decimals: 18},
  explorerBaseUrl: EXPLORER,
  fastPathMaxDisplay: '5 USDC',
  protocolFeeBps: 100,
  minJobAmount: '10000',
  minFee: '100',
  windows: {accept: 600, work: 1800, review: 600, dispute: 3600},
  // v3 fees and limits: the testnet values in agentx-contracts config/params.10143.json.
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
  chainId: 10143,
  name,
  description: `${name} does research`,
  capabilities: ['market-research'],
  pricePerTask: '20000',
  priceDisplay: '0.02 USDC',
  walletAddress: '0x0000000000000000000000000000000000000002',
  score: 72,
  completed: 3,
  failed: 1,
  successRate: 0.75,
  active: true,
  explorerUrl: `${EXPLORER}/address/0x0000000000000000000000000000000000000002`,
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
  chainId: 10143,
  network: 'Monad Testnet',
  testnet: true,
  goal: 'Research ETH/USDC liquidity on Monad',
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
      explorerUrl: `${EXPLORER}/tx/0xabc`,
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
      payload: {jobId: JOB_ID, amount: '0.02 USDC', explorerUrl: `${EXPLORER}/tx/0xabc`},
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
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

// The shape of GET /v1/status (agentx-backend apps/api/src/routes/status.ts):
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
      {address: '0x' + 'd5'.repeat(20), role: 'signing-key', balanceWei: '74638165459998076677', low: false},
      {address: '0x' + '5c'.repeat(20), role: 'keeper', balanceWei: '90000000000000000', low: true},
    ],
  },
  chains: [
    {
      chainId: 10143,
      name: 'Monad Testnet',
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

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, null);
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
      chainId: 10143,
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
        {kind: 'created', explorerUrl: `${EXPLORER}/tx/0xabc`},
        {kind: 'job.settled', explorerUrl: null},
        {kind: 'settled', explorerUrl: `${EXPLORER}/tx/0xsettle`},
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
