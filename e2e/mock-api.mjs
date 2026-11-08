/**
 * A stand-in Pactora API for the smoke test: fixed responses, no database, no
 * chain. It proves the pages render, route and link correctly against the
 * API's shapes — it proves nothing about the API itself, which has its own
 * tests and the live-chain checks in pactora-backend-near/scripts.
 */
import {createHash, randomUUID} from 'node:crypto';
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
    'access-control-allow-headers': 'authorization, content-type, idempotency-key',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
      person: personOf(body.accountId),
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
        person: personOf(account),
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

// ─── the job board: listings, bids, jobs, /v1/me, person actions ─────────────
// Stateful, in memory. Every test works on a fixture of its own (an id no other
// test touches), so tests running in parallel never see each other's changes.
// It proves the pages follow the API's shapes; it proves nothing about the API.

const PEOPLE = {
  'veteran.testnet': {agentId: '9', publicId: 'p-9', chainAgentId: '9', name: 'Veteran'},
  'olive.testnet': {
    agentId: '11',
    chainAgentId: '101',
    name: 'Olive',
    location: 'Pune',
    capabilities: ['photography'],
  },
  'wade.testnet': {
    agentId: '22',
    chainAgentId: '102',
    name: 'Wade',
    location: 'Pune',
    capabilities: ['photography', 'writing'],
  },
  'nora.testnet': {agentId: '33', chainAgentId: '103', name: 'Nora', location: 'Delhi', capabilities: []},
  'mia.testnet': {
    agentId: '66',
    chainAgentId: '106',
    name: 'Mia',
    location: 'Goa',
    capabilities: ['writing'],
    earnings: {settledCount: 3, receivedBaseUnits: '2970000'},
    spent: '1000000',
  },
};
const personOf = (account) => {
  const p = PEOPLE[account];
  return p ? {publicId: p.publicId ?? `p-${p.agentId}`, chainAgentId: p.chainAgentId, name: p.name} : null;
};
const agentOfAccount = (account) => PEOPLE[account]?.agentId ?? null;

const base = (n) => String(n);
const display = (units) => {
  const d = String(units).padStart(7, '0');
  const frac = d.slice(-6).replace(/0+$/, '');
  return `${d.slice(0, -6)}${frac ? `.${frac}` : ''} USDC`;
};
const feeOf = (price) => Math.max(100, Math.floor((Number(price) * 100) / 10_000));

const listings = new Map();
const jobs = new Map();
const idempotency = new Map();
let counter = 0;
const nextId = (prefix) => `${prefix}${String(++counter).padStart(4, '0')}`;
const jobUuid = () => `bbbbbbbb-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const DANA = {agentId: '31', kind: 'agent', name: 'DanaBot', publicId: 'a-31'};
const clientOf = (account) => ({
  agentId: agentOfAccount(account),
  kind: 'person',
  name: PEOPLE[account].name,
  publicId: `p-${agentOfAccount(account)}`,
});

function addListing(id, over = {}) {
  const createdAt = over.createdAt ?? new Date().toISOString();
  const l = {
    listingId: id,
    chainId: 'near:testnet',
    client: DANA,
    title: `Listing ${id}`,
    description: 'Photograph the shopfront at 12 Main Street, in daylight, two photos.',
    category: 'physical',
    interactionMode: 'capture',
    skills: ['photography'],
    location: 'Pune',
    maxPriceBaseUnits: '5000000',
    maxWorkers: 1,
    hiringMode: 'applications',
    estimatedMinutes: 45,
    deadline: '2030-01-01T00:00:00.000Z',
    criteria: 'Both photos are sharp and show the whole sign.',
    acceptWindowSeconds: 600,
    workWindowSeconds: 1800,
    status: 'open',
    reservedBaseUnits: '5000000',
    createdAt,
    updatedAt: createdAt,
    funding: 'person',
    slots: [],
    applications: [],
    ...over,
  };
  listings.set(id, l);
  return l;
}

function addApplication(l, over = {}) {
  const price = over.price ?? 4_000_000;
  const a = {
    applicationId: nextId('app-'),
    status: 'pending',
    price,
    proposal: 'I know the street well and can shoot it on Tuesday morning.',
    reason: null,
    reopenable: false,
    jobId: null,
    createdAt: over.createdAt ?? new Date().toISOString(),
    decidedAt: null,
    applicantAgentId: '22',
    applicant: {
      agentId: '22',
      publicId: 'p-22',
      kind: 'person',
      name: 'Wade',
      location: 'Pune',
      score: 70,
      completed: 4,
    },
    ...over,
  };
  l.applications.push(a);
  return a;
}

const application = (a) => ({
  applicationId: a.applicationId,
  status: a.status,
  priceBaseUnits: base(a.price),
  priceDisplay: display(a.price),
  feeBaseUnits: base(feeOf(a.price)),
  workerReceivesBaseUnits: base(a.price - feeOf(a.price)),
  proposal: a.proposal,
  reason: a.reason,
  reopenable: a.reopenable,
  jobId: a.jobId,
  createdAt: a.createdAt,
  decidedAt: a.decidedAt,
});

const listingView = (l) => {
  const ceiling = Number(l.maxPriceBaseUnits);
  return {
    listingId: l.listingId,
    chainId: l.chainId,
    client: l.client,
    title: l.title,
    description: l.description,
    category: l.category,
    interactionMode: l.interactionMode,
    skills: l.skills,
    location: l.location,
    maxPriceBaseUnits: l.maxPriceBaseUnits,
    maxPriceDisplay: display(ceiling),
    feeAtCeilingBaseUnits: base(feeOf(ceiling)),
    workerReceivesAtCeilingBaseUnits: base(ceiling - feeOf(ceiling)),
    maxWorkers: l.maxWorkers,
    slotsFilled: l.slots.length,
    hiringMode: l.hiringMode,
    estimatedMinutes: l.estimatedMinutes,
    deadline: l.deadline,
    criteria: l.criteria,
    acceptWindowSeconds: l.acceptWindowSeconds,
    workWindowSeconds: l.workWindowSeconds,
    status: l.status,
    reservedBaseUnits: l.reservedBaseUnits,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
};

// Seeds ----------------------------------------------------------------------
addListing('lst-view', {createdAt: '2026-10-01T10:00:00.000Z', title: 'Photograph a shopfront'});
addListing('lst-apply', {createdAt: '2026-10-02T10:00:00.000Z', title: 'Bid on me'});
const withdrawable = addListing('lst-withdraw', {
  createdAt: '2026-10-03T10:00:00.000Z',
  title: 'Withdraw from me',
});
addApplication(withdrawable, {price: 3_000_000});
const limited = addListing('lst-limit', {createdAt: '2026-10-04T10:00:00.000Z', title: 'No bids left here'});
for (const status of ['withdrawn', 'rejected', 'withdrawn']) addApplication(limited, {status});
const instant = addListing('lst-instant', {
  createdAt: '2026-10-05T10:00:00.000Z',
  title: 'Take a slot',
  hiringMode: 'instant',
  maxWorkers: 2,
});
void instant;
addListing('lst-match', {
  createdAt: '2026-10-06T10:00:00.000Z',
  title: 'Fits a photographer',
  skills: ['photography', 'matchtest'],
  location: 'Pune',
});
addListing('lst-nomatch', {
  createdAt: '2026-10-07T10:00:00.000Z',
  title: 'Fits nobody here',
  skills: ['matchtest', 'welding'],
  location: 'Chennai',
});
for (let i = 1; i <= 14; i++) {
  addListing(`lst-board-${String(i).padStart(2, '0')}`, {
    createdAt: new Date(Date.UTC(2026, 9, 20, 12, i)).toISOString(),
    title: `Board listing ${String(i).padStart(2, '0')}`,
    category: i <= 2 ? 'judgment' : 'expertise',
    interactionMode: i % 2 ? 'task' : 'conversation',
    skills: ['boardtest'],
    location: i > 9 ? 'Mumbai' : 'Pune',
  });
}

const OWN = {client: clientOf('olive.testnet')};
const own = (id, over = {}) =>
  addListing(id, {...OWN, createdAt: '2026-10-10T10:00:00.000Z', title: `Mine ${id}`, ...over});
const paged = own('lst-own-page', {maxWorkers: 3, title: 'Mine with many bids'});
for (let i = 1; i <= 25; i++) {
  addApplication(paged, {
    price: 1_000_000 + ((i * 7) % 25) * 100_000,
    createdAt: new Date(Date.UTC(2026, 10, 1, 8, i)).toISOString(),
    applicant: {
      agentId: String(200 + i),
      publicId: `p-${200 + i}`,
      kind: 'person',
      name: `Bidder ${String(i).padStart(2, '0')}`,
      location: 'Pune',
      score: 40 + i,
      completed: i,
    },
    applicantAgentId: String(200 + i),
  });
}
const twoBids = (id, over = {}) => {
  const l = own(id, over);
  addApplication(l, {price: 4_000_000, createdAt: '2026-11-01T08:00:00.000Z'});
  addApplication(l, {
    price: 3_000_000,
    createdAt: '2026-11-01T09:00:00.000Z',
    applicantAgentId: '33',
    applicant: {
      agentId: '33',
      publicId: 'p-33',
      kind: 'person',
      name: 'Nora',
      location: 'Delhi',
      score: 55,
      completed: 1,
    },
  });
  return l;
};
twoBids('lst-own-fund');
twoBids('lst-own-signer', {funding: 'signer'});
twoBids('lst-own-reject');
twoBids('lst-own-close');
twoBids('lst-own-edit');
twoBids('lst-own-cancel');
const filled = twoBids('lst-own-filled', {status: 'open'});
filled.slots.push({slot: 1, jobId: 'bbbbbbbb-0000-4000-8000-00000000f001'});
filled.applications[0].status = 'selected';
filled.applications[0].jobId = 'bbbbbbbb-0000-4000-8000-00000000f001';
for (let i = 1; i <= 2; i++) {
  const l = own(`lst-mia-${i}`, {client: clientOf('mia.testnet'), title: `Mia listing ${i}`});
  void l;
}

// Jobs -----------------------------------------------------------------------
const EVENT_KIND = {
  create: 'job.created',
  accept: 'job.accepted',
  submit: 'job.submitted',
  approve: 'job.settled',
  dispute: 'job.disputed',
  cancel: 'job.refunded',
};
const METHOD = {
  create: 'create_job',
  accept: 'accept_job',
  submit: 'submit_result',
  approve: 'approve',
  dispute: 'dispute',
  cancel: 'cancel_job',
};
const RULES = {
  create: {party: 'client', from: ['created'], to: 'created'},
  accept: {party: 'worker', from: ['created'], to: 'accepted'},
  submit: {party: 'worker', from: ['accepted'], to: 'submitted'},
  approve: {party: 'client', from: ['submitted'], to: 'settled'},
  dispute: {party: 'client', from: ['submitted'], to: 'disputed'},
  cancel: {party: 'client', from: ['created'], to: 'refunded'},
};

function addJob(id, over = {}) {
  const j = {
    jobId: id,
    chainJobId: '5000',
    state: 'created',
    amount: '4000000',
    fee: null,
    client: '11',
    worker: '22',
    result: null,
    resultMismatch: false,
    createdAt: '2026-11-02T09:00:00.000Z',
    settledAt: null,
    events: [{kind: 'job.created', txHash: 'T0', occurredAt: '2026-11-02T09:00:00.000Z'}],
    behaviour: 'normal',
    signerOverride: null,
    confirmed: {},
    streams: new Set(),
    dispute: null,
    declined: null,
    ...over,
  };
  jobs.set(id, j);
  return j;
}
const JOB = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
addJob(JOB(1), {
  state: 'settled',
  fee: '40000',
  settledAt: '2026-11-02T10:00:00.000Z',
  result: {answer: 'Done.'},
  events: [
    {
      kind: 'job.created',
      txHash: '6zgh2u9DqHHiXzdy9ouTP7oGky2T4nugqzqt9wJZwNFm',
      occurredAt: '2026-11-02T09:00:00.000Z',
    },
    {kind: 'job.accepted', txHash: null, occurredAt: '2026-11-02T09:05:00.000Z'},
    {
      kind: 'job.settled',
      txHash: '8Ha3ThYvqv4WQx2t4ZCSFmAS5hj7VG4EHVgPeLJP7tUZ',
      occurredAt: '2026-11-02T10:00:00.000Z',
    },
  ],
});
addJob(JOB(2));
addJob(JOB(3), {chainJobId: '5003'});
addJob(JOB(4), {state: 'accepted', chainJobId: '5004'});
addJob(JOB(5), {
  state: 'submitted',
  chainJobId: '5005',
  result: {answer: 'Photos attached.'},
  resultHash: 'abc',
});
addJob(JOB(6), {state: 'submitted', chainJobId: '5006', result: {answer: 'Photos attached.'}});
addJob(JOB(7), {state: 'created', chainJobId: '5007'});
addJob(JOB(8), {
  state: 'submitted',
  chainJobId: '5008',
  result: {answer: 'Different.'},
  resultMismatch: true,
});
addJob(JOB(9), {state: 'submitted', chainJobId: '5009', result: {answer: 'Slow.'}, behaviour: 'slow'});
addJob(JOB(10), {state: 'submitted', chainJobId: '5010', result: {answer: 'Reverts.'}, behaviour: 'revert'});
addJob(JOB(11), {state: 'created', chainJobId: null});
addJob(JOB(12), {state: 'created', chainJobId: '5012', signerOverride: 'someone.testnet'});
addJob(JOB(13), {state: 'accepted', chainJobId: '5013'});
addJob(JOB(14), {state: 'created', chainJobId: '5014'});
addJob(JOB(15), {state: 'submitted', chainJobId: '5015', result: {answer: 'x'}});
addJob(JOB(17), {state: 'submitted', chainJobId: '5017', result: {answer: 'y'}});
addJob(JOB(16), {
  state: 'created',
  chainJobId: '5016',
  declined: {reason: 'Too far away for me.', at: '2026-11-02T09:30:00.000Z'},
});
for (let i = 1; i <= 3; i++) {
  addJob(JOB(30 + i), {
    client: i === 2 ? '66' : '55',
    worker: i === 2 ? '55' : '66',
    state: i === 1 ? 'settled' : 'accepted',
    chainJobId: String(6000 + i),
    amount: '1000000',
    fee: '10000',
    createdAt: `2026-11-0${i}T09:00:00.000Z`,
  });
}

// Listing jobs (docs/26 F6-F8): delivered through drafts. Olive (11) is the
// client, Wade (22) the worker; a test that changes one clones it first.
const LISTING_SPEC = {
  capability: 'photography',
  input: {
    listing: {
      listingId: 'lst-shop',
      title: 'Photograph two shop fronts',
      description: 'A clear daytime photo of each of two shop fronts.',
      criteria: '- Both shop fronts are shown\n- Each sign is readable',
    },
    application: {applicationId: 'app-1', proposal: 'Within the hour.'},
    priceBaseUnits: '4000000',
  },
};
const listingJob = (n, over = {}) =>
  addJob(JOB(n), {
    state: 'accepted',
    chainJobId: String(7000 + n),
    spec: LISTING_SPEC,
    drafts: [],
    files: [],
    messages: [],
    ...over,
  });
listingJob(40); // accepted, nothing delivered yet
listingJob(41, {state: 'created'}); // not accepted: chat and drafts closed
listingJob(42); // filled below: a round awaiting review, with a photo and a message
listingJob(43); // filled below: an accepted draft, ready to submit
addJob(JOB(50), {state: 'disputed', chainJobId: '7050'}); // the admin desk's dispute

const jobView = (j) => ({
  jobId: j.jobId,
  chainJobId: j.chainJobId,
  chainId: 'near:testnet',
  network: 'NEAR Testnet',
  state: j.state,
  path: 'escrow',
  amount: j.amount,
  amountDisplay: display(j.amount),
  fee: j.fee,
  spec: j.spec ?? {capability: 'photo-capture', input: {}},
  specHash: '0x' + 'ab'.repeat(32),
  result: j.result,
  resultHash: j.result ? '0x' + 'cd'.repeat(32) : null,
  resultMismatch: j.resultMismatch,
  clientAgentId: j.client,
  workerAgentId: j.worker,
  createdAt: j.createdAt,
  settledAt: j.settledAt,
  events: j.events.map((e) => ({
    kind: e.kind,
    txHash: e.txHash,
    explorerUrl: e.txHash ? `${EXPLORER}/txns/${e.txHash}` : null,
    occurredAt: e.occurredAt,
  })),
  declined: j.declined,
  dispute: j.dispute,
});
const jobRow = (j, agentId) => ({
  jobId: j.jobId,
  chainJobId: j.chainJobId,
  chainId: 'near:testnet',
  state: j.state,
  path: 'escrow',
  amount: j.amount,
  amountDisplay: display(j.amount),
  spec: {capability: 'photo-capture'},
  specHash: '0x' + 'ab'.repeat(32),
  role: j.worker === agentId ? 'worker' : 'client',
  hasResult: j.result !== null,
  resultMismatch: j.resultMismatch,
  clientAgentId: j.client,
  workerAgentId: j.worker,
  createdAt: j.createdAt,
});

function pushEvent(j, kind, txHash) {
  const e = {kind, txHash, occurredAt: new Date().toISOString()};
  j.events.push(e);
  for (const res of j.streams)
    res.write(`id: ${j.events.length}\nevent: ${kind}\ndata: ${JSON.stringify({kind})}\n\n`);
}

function jobEvents(req, res, j) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  res.write('retry: 3000\n\n');
  j.events.forEach((e, i) =>
    res.write(`id: ${i + 1}\nevent: ${e.kind}\ndata: ${JSON.stringify({kind: e.kind})}\n\n`),
  );
  j.streams.add(res);
  const beat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(beat);
    j.streams.delete(res);
  });
}

const problem = (res, status, code, detail, extra = {}) => send(res, status, {code, detail, ...extra});

function transition(j, action, txHash) {
  const rule = RULES[action];
  j.state = rule.to;
  if (action === 'create') j.chainJobId = String(9000 + counter++);
  if (action === 'approve') {
    j.fee = String(feeOf(j.amount));
    j.settledAt = new Date().toISOString();
  }
  pushEvent(j, EVENT_KIND[action], txHash);
}

async function personActions(req, res, url, account) {
  const m = /^\/v1\/jobs\/([^/]+)\/person-actions\/(prepare|confirm)$/.exec(url.pathname);
  const j = jobs.get(m[1]);
  if (!j) return problem(res, 404, 'NOT_FOUND', 'no such job');
  const me = agentOfAccount(account);
  const body = await readBody(req);
  const rule = RULES[body.action];
  if (!rule) return problem(res, 400, 'VALIDATION', 'unknown action');
  const partyAgent = rule.party === 'client' ? j.client : j.worker;
  if (me !== partyAgent) return problem(res, 403, 'FORBIDDEN', `only the ${rule.party} may ${body.action}`);

  if (m[2] === 'prepare') {
    if (!rule.from.includes(j.state)) return problem(res, 409, 'INVALID_STATE', `job is ${j.state}`);
    if (body.action === 'create' && j.chainJobId)
      return problem(res, 409, 'INVALID_STATE', 'job is already on chain');
    if (body.action !== 'create' && !j.chainJobId)
      return problem(res, 409, 'INVALID_STATE', 'job is not on chain yet');
    if (body.action === 'approve' && j.drafts && !draftSummary(j).readyToApprove)
      return problem(res, 409, 'INVALID_STATE', 'approve waits for the accepted draft on chain');
    if (body.action === 'approve' && j.resultMismatch)
      return problem(
        res,
        409,
        'RESULT_MISMATCH',
        'the chain committed a different result hash than the delivery',
      );
    const out = {
      jobId: j.jobId,
      action: body.action,
      signerId: j.signerOverride ?? account,
      functionCall: {
        receiverId: 'pactora.testnet',
        methodName: METHOD[body.action],
        args: {
          job_id: j.chainJobId ? Number(j.chainJobId) : null,
          ...(body.action === 'create' ? {worker: Number(j.worker)} : {}),
        },
        gas: '100000000000000',
        deposit: '0',
      },
      expectedEvent: EVENT_KIND[body.action],
    };
    if (body.action === 'submit' && j.drafts) {
      // A listing job: the submission is the accepted draft's hash, nothing typed.
      const acc = j.drafts.find((d) => d.review?.decision === 'accept_draft');
      if (!acc)
        return problem(res, 409, 'INVALID_STATE', 'a listing job is submitted from an accepted draft');
      j.result = {draftId: acc.draftId, snapshotHash: acc.snapshotHash, round: acc.round};
      out.resultHash = acc.snapshotHash;
      j.resultHash = acc.snapshotHash;
    } else if (body.action === 'submit') {
      if (!body.output || typeof body.output !== 'object' || !body.producedAt)
        return problem(res, 400, 'VALIDATION', 'a delivery needs an output and producedAt');
      j.result = body.output;
      out.resultHash = '0x' + 'cd'.repeat(32);
    }
    if (body.action === 'dispute') {
      if (typeof body.reason !== 'string' || body.reason.trim().length < 10)
        return problem(res, 400, 'VALIDATION', 'a dispute needs a reason of at least 10 characters');
      j.dispute = {reason: body.reason, reasonHash: '0x' + 'ef'.repeat(32), at: new Date().toISOString()};
      out.reasonHash = j.dispute.reasonHash;
    }
    j.prepared = [...(j.prepared ?? []), body.action];
    return send(res, 200, out);
  }

  // confirm
  if (j.confirmed[body.txHash]) return send(res, 200, {...j.confirmed[body.txHash], replayed: true});
  if (j.behaviour === 'revert')
    return problem(
      res,
      409,
      'INVALID_STATE',
      'the transaction reverted: no matching event in a successful receipt',
    );
  j.attempts = {...(j.attempts ?? {}), [body.txHash]: (j.attempts?.[body.txHash] ?? 0) + 1};
  if (j.behaviour === 'slow' && j.attempts[body.txHash] < 2)
    return problem(res, 409, 'INVALID_STATE', 'the transaction is not final yet', {retryAfter: 1});
  if (!rule.from.includes(j.state)) return problem(res, 409, 'INVALID_STATE', `job is ${j.state}`);
  transition(j, body.action, body.txHash);
  j.confirmCount = (j.confirmCount ?? 0) + 1;
  const done = {
    jobId: j.jobId,
    action: body.action,
    txHash: body.txHash,
    state: j.state,
    chainJobId: j.chainJobId,
    resultMismatch: j.resultMismatch,
    explorerUrl: `${EXPLORER}/txns/${body.txHash}`,
    replayed: false,
  };
  j.confirmed[body.txHash] = done;
  return send(res, 200, done);
}

function newJob(l, a, workerAgentId) {
  const id = jobUuid();
  const j = addJob(id, {
    chainJobId: null,
    client: l.client.agentId,
    worker: workerAgentId,
    amount: base(a?.price ?? l.maxPriceBaseUnits),
    events: [{kind: 'job.created', txHash: null, occurredAt: new Date().toISOString()}],
  });
  l.slots.push({slot: l.slots.length + 1, jobId: j.jobId});
  if (l.slots.length >= l.maxWorkers) l.status = 'filled';
  l.updatedAt = new Date().toISOString();
  return j;
}

const jobSummary = (j) => ({
  jobId: j.jobId,
  chainJobId: j.chainJobId,
  state: j.state,
  amount: j.amount,
  amountDisplay: display(j.amount),
  specHash: '0x' + 'ab'.repeat(32),
  spec: {capability: 'photo-capture'},
});

async function market(req, res, url) {
  const account = sessionAccount(req);
  const me = account ? agentOfAccount(account) : null;
  const path = url.pathname;

  if (path === '/v1/me') {
    if (!account) return problem(res, 401, 'UNAUTHORIZED', 'no session');
    const p = PEOPLE[account];
    if (!p)
      return send(res, 200, {
        account,
        chainId: 'near:testnet',
        person: null,
        earnings: {settledCount: 0, receivedBaseUnits: '0'},
        spentBaseUnits: '0',
      });
    return send(res, 200, {
      account,
      chainId: 'near:testnet',
      person: {
        publicId: p.publicId ?? `p-${p.agentId}`,
        agentId: p.agentId,
        chainAgentId: p.chainAgentId,
        name: p.name,
        description: null,
        location: p.location ?? null,
        capabilities: p.capabilities ?? [],
      },
      earnings: p.earnings ?? {settledCount: 0, receivedBaseUnits: '0'},
      spentBaseUnits: p.spent ?? '0',
    });
  }

  if (path === '/v1/jobs' && req.method === 'GET') {
    if (!account || !me) return problem(res, 401, 'UNAUTHORIZED', 'no session');
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const after = url.searchParams.get('cursor');
    const mine = [...jobs.values()]
      .filter((j) => j.client === me || j.worker === me)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const start = after ? mine.findIndex((j) => j.jobId === after) + 1 : 0;
    const rows = mine.slice(start, start + limit);
    const more = start + limit < mine.length;
    return send(res, 200, {
      count: rows.length,
      nextCursor: more ? rows.at(-1).jobId : null,
      jobs: rows.map((j) => jobRow(j, me)),
    });
  }

  if ((await channelRoutes(req, res, path, account, me)) !== null) return;
  if ((await adminRoutes(req, res, path, account)) !== null) return;
  if ((await kycRoutes(req, res, path, account, me)) !== null) return;
  if ((await profileRoutes(req, res, path, account, me, url)) !== null) return;
  if ((await feedRoutes(req, res, path, account, me, url)) !== null) return;
  if ((await delivery(req, res, path, me)) !== null) return;

  const jobMatch = /^\/v1\/jobs\/([^/]+)(\/events|\/person-actions\/(?:prepare|confirm))?$/.exec(path);
  if (jobMatch) {
    const j = jobs.get(jobMatch[1]);
    if (!j) return problem(res, 404, 'NOT_FOUND', 'no such job');
    if (jobMatch[2] === '/events') return jobEvents(req, res, j);
    if (jobMatch[2]) {
      if (!account) return problem(res, 401, 'UNAUTHORIZED', 'no session');
      return personActions(req, res, url, account);
    }
    return send(res, 200, jobView(j));
  }

  if (path === '/v1/listings' && req.method === 'GET') {
    const q = url.searchParams;
    const limit = Number(q.get('limit') ?? 20);
    const status = q.get('status') ?? 'open';
    let rows = [...listings.values()].filter((l) => l.status === status);
    if (q.get('category')) rows = rows.filter((l) => l.category === q.get('category'));
    if (q.get('interactionMode')) rows = rows.filter((l) => l.interactionMode === q.get('interactionMode'));
    if (q.get('hiringMode')) rows = rows.filter((l) => l.hiringMode === q.get('hiringMode'));
    if (q.get('skill')) rows = rows.filter((l) => l.skills.includes(q.get('skill')));
    if (q.get('location')) rows = rows.filter((l) => l.location === '' || l.location === q.get('location'));
    if (q.get('match') === 'me') {
      if (!account) return problem(res, 401, 'UNAUTHORIZED', 'match=me needs a session');
      const caps = PEOPLE[account]?.capabilities ?? [];
      rows = rows.filter((l) => l.skills.some((s) => caps.includes(s)));
    }
    if (q.get('mine') === 'true') {
      if (!account) return problem(res, 401, 'UNAUTHORIZED', 'mine=true needs a session');
      rows = rows.filter((l) => l.client.agentId === me);
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.listingId.localeCompare(a.listingId));
    const after = q.get('cursor');
    const start = after ? rows.findIndex((l) => l.listingId === after) + 1 : 0;
    const page = rows.slice(start, start + limit);
    const more = start + limit < rows.length;
    return send(res, 200, {
      count: page.length,
      nextCursor: more ? page.at(-1).listingId : null,
      listings: page.map(listingView),
    });
  }

  if (path === '/v1/listings' && req.method === 'POST') {
    if (!account || !me) return problem(res, 401, 'UNAUTHORIZED', 'no session');
    const key = req.headers['idempotency-key'];
    if (!key) return problem(res, 400, 'VALIDATION', 'Idempotency-Key is required');
    const body = await readBody(req);
    const json = JSON.stringify(body);
    const seen = idempotency.get(key);
    if (seen) {
      if (seen.json !== json)
        return problem(res, 409, 'IDEMPOTENCY_CONFLICT', 'this key was used with a different body');
      return send(res, 200, listingView(seen.listing));
    }
    if (body.title?.includes('BROKE'))
      return problem(
        res,
        402,
        'INSUFFICIENT_FUNDS',
        'the daily allowance cannot reserve maxWorkers x ceiling',
      );
    if (body.title?.includes('FLAKY') && !flaky.has(body.title)) {
      flaky.add(body.title);
      return problem(res, 503, 'UPSTREAM_UNAVAILABLE', 'try again');
    }
    if (body.workWindowSeconds > 18_000)
      return problem(res, 400, 'WINDOW_TOO_LONG', 'workWindowSeconds is above this chain maximum');
    const l = addListing(nextId('lst-new-'), {
      client: clientOf(account),
      title: body.title,
      description: body.description,
      category: body.category,
      interactionMode: body.interactionMode,
      skills: body.skills ?? [],
      location: body.location ?? '',
      maxPriceBaseUnits: body.maxPriceBaseUnits,
      reservedBaseUnits: String(Number(body.maxPriceBaseUnits) * body.maxWorkers),
      maxWorkers: body.maxWorkers,
      hiringMode: body.hiringMode ?? 'applications',
      estimatedMinutes: body.estimatedMinutes,
      deadline: body.deadline,
      criteria: body.criteria,
      acceptWindowSeconds: body.acceptWindowSeconds ?? 600,
      workWindowSeconds: body.workWindowSeconds ?? 1800,
    });
    l.created = (created.get(body.title) ?? 0) + 1;
    created.set(body.title, l.created);
    idempotency.set(key, {json, listing: l});
    return send(res, 201, listingView(l));
  }

  const lm = /^\/v1\/listings\/([^/]+)(?:\/(applications|decide|close|reopen|claim))?$/.exec(path);
  if (lm) {
    const l = listings.get(lm[1]);
    if (!l) return problem(res, 404, 'NOT_FOUND', 'no such listing');
    const sub = lm[2];
    const isOwner = me !== null && l.client.agentId === me;

    if (!sub && req.method === 'GET') {
      const view = listingView(l);
      if (!account) return send(res, 200, view);
      view.viewer = isOwner
        ? {isOwner: true, slots: l.slots}
        : {
            isOwner: false,
            applications: l.applications.filter((a) => a.applicantAgentId === me).map(application),
          };
      return send(res, 200, view);
    }

    if (!account || !me) return problem(res, 401, 'UNAUTHORIZED', 'no session');

    if (sub === 'applications' && req.method === 'GET') {
      if (!isOwner) return problem(res, 403, 'FORBIDDEN', 'only the client sees the bids');
      const sort = url.searchParams.get('sort') ?? 'recent';
      const page = Number(url.searchParams.get('page') ?? 1);
      const rows = [...l.applications];
      const cmp = {
        recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
        price_low: (a, b) => a.price - b.price,
        price_high: (a, b) => b.price - a.price,
        rating: (a, b) => b.applicant.score - a.applicant.score,
      }[sort];
      rows.sort(cmp);
      return send(res, 200, {
        total: rows.length,
        page,
        pageSize: 20,
        sort,
        applications: rows
          .slice((page - 1) * 20, page * 20)
          .map((a) => ({...application(a), applicant: a.applicant})),
      });
    }

    if (sub === 'applications' && req.method === 'POST') {
      const body = await readBody(req);
      const mine = l.applications.filter((a) => a.applicantAgentId === me);
      if (body.action === 'withdraw') {
        const a = mine.find(
          (x) => x.status === 'pending' && (!body.applicationId || x.applicationId === body.applicationId),
        );
        if (!a) return problem(res, 404, 'NOT_FOUND', 'you have no such bid on this listing');
        a.status = 'withdrawn';
        a.decidedAt = new Date().toISOString();
        return send(res, 200, application(a));
      }
      if (l.hiringMode !== 'applications')
        return problem(res, 409, 'INVALID_STATE', 'this listing is instant: claim it');
      if (l.status !== 'open') return problem(res, 409, 'INVALID_STATE', `this listing is ${l.status}`);
      if (mine.some((a) => a.status === 'pending' || a.status === 'selected'))
        return problem(
          res,
          409,
          'INVALID_STATE',
          'you already have a live bid on this listing — withdraw it first',
        );
      if (mine.filter((a) => !a.reopenable).length >= 3)
        return problem(res, 409, 'LIMIT_REACHED', 'at most 3 bids per applicant per listing');
      if (typeof body.proposal !== 'string' || body.proposal.trim().length < 20)
        return problem(res, 400, 'VALIDATION', 'proposal is at least 20 characters');
      if (Number(body.priceBaseUnits) > Number(l.maxPriceBaseUnits))
        return problem(res, 400, 'PRICE_ABOVE_MAX', 'your price is above the listing ceiling');
      const p = PEOPLE[account];
      const a = addApplication(l, {
        price: Number(body.priceBaseUnits),
        proposal: body.proposal.trim(),
        applicantAgentId: me,
        applicant: {
          agentId: me,
          publicId: `p-${me}`,
          kind: 'person',
          name: p.name,
          location: p.location ?? '',
          score: 60,
          completed: 0,
        },
      });
      return send(res, 201, application(a));
    }

    if (sub === 'claim') {
      if (l.hiringMode !== 'instant')
        return problem(res, 409, 'INVALID_STATE', 'this listing takes applications');
      if (l.slots.length >= l.maxWorkers) return problem(res, 409, 'INVALID_STATE', 'no slot left');
      const a = addApplication(l, {
        price: Number(l.maxPriceBaseUnits),
        status: 'selected',
        applicantAgentId: me,
      });
      const j = newJob(l, a, me);
      a.jobId = j.jobId;
      return send(res, 201, {application: application(a), job: jobSummary(j), replayed: false});
    }

    if (!isOwner) return problem(res, 403, 'FORBIDDEN', 'only the client may do that');

    if (sub === 'decide') {
      const body = await readBody(req);
      if (typeof body.reason !== 'string' || body.reason.trim().length < 10)
        return problem(res, 400, 'VALIDATION', 'a reason is 10-2000 characters');
      const a = l.applications.find((x) => x.applicationId === body.applicationId);
      if (!a) return problem(res, 404, 'NOT_FOUND', 'no such bid');
      if (a.status !== 'pending') return problem(res, 409, 'INVALID_STATE', `this bid is ${a.status}`);
      a.reason = body.reason.trim();
      a.decidedAt = new Date().toISOString();
      if (body.action === 'reject') {
        a.status = 'rejected';
        return send(res, 200, {application: application(a), replayed: false});
      }
      a.status = 'selected';
      const j = newJob(l, a, a.applicantAgentId);
      a.jobId = j.jobId;
      const funding =
        l.funding === 'signer'
          ? {by: 'signer', txHash: 'SIGNERTX1', explorerUrl: `${EXPLORER}/txns/SIGNERTX1`}
          : {
              by: 'person',
              done: false,
              signerId: account,
              functionCall: {
                receiverId: 'pactora.testnet',
                methodName: 'create_job',
                args: {},
                gas: '100000000000000',
                deposit: '0',
              },
              confirm: `/v1/jobs/${j.jobId}/person-actions/confirm`,
            };
      if (l.funding === 'signer') j.chainJobId = '7000';
      return send(res, 200, {application: application(a), job: jobSummary(j), funding, replayed: false});
    }

    if (sub === 'close') {
      if (l.status !== 'open') return problem(res, 409, 'INVALID_STATE', `this listing is ${l.status}`);
      l.status = 'closed';
      for (const a of l.applications) if (a.status === 'pending') a.reopenable = true;
      return send(res, 200, listingView(l));
    }
    if (sub === 'reopen') {
      if (l.status !== 'closed') return problem(res, 409, 'INVALID_STATE', `this listing is ${l.status}`);
      l.status = 'open';
      for (const a of l.applications) a.reopenable = false;
      return send(res, 200, listingView(l));
    }
    if (!sub && req.method === 'PATCH') {
      if (l.slots.length > 0) return problem(res, 409, 'INVALID_STATE', 'a worker has been selected');
      const patch = await readBody(req);
      for (const k of ['title', 'description', 'criteria', 'maxPriceBaseUnits'])
        if (patch[k] !== undefined) l[k] = patch[k];
      l.updatedAt = new Date().toISOString();
      return send(res, 200, listingView(l));
    }
    if (!sub && req.method === 'DELETE') {
      if (l.slots.length > 0) return problem(res, 409, 'INVALID_STATE', 'a worker has been selected');
      l.status = 'cancelled';
      for (const a of l.applications) if (a.status === 'pending') a.status = 'rejected';
      return send(res, 200, listingView(l));
    }
  }
  return null;
}

const flaky = new Set();
const created = new Map();

// ── channels: Telegram and email (the API's routes/channels.ts) ──
// Per account; the email code is always 246810 here, the Telegram code fixed.
const channelState = new Map();
async function channelRoutes(req, res, path, account, me) {
  if (!path.startsWith('/v1/me/channels')) return null;
  if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
  if (!me) return problem(res, 403, 'FORBIDDEN', 'channels are for people');
  const st = channelState.get(account) ?? {links: [], pendingEmail: null};
  channelState.set(account, st);
  if (path === '/v1/me/channels' && req.method === 'GET')
    return send(res, 200, {telegram: {bot: 'PactoraTestBot'}, email: true, links: st.links});
  if (path === '/v1/me/channels/telegram/code' && req.method === 'POST')
    return send(res, 201, {
      code: 'K7M2Q9XP',
      number: '4821',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      bot: 'PactoraTestBot',
    });
  if (path === '/v1/me/channels/email' && req.method === 'POST') {
    const b = await readBody(req);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.address ?? '')))
      return problem(res, 422, 'SCHEMA_MISMATCH', 'address: Invalid email');
    st.pendingEmail = String(b.address).toLowerCase();
    return send(res, 202, {address: `${st.pendingEmail[0]}***@${st.pendingEmail.split('@')[1]}`});
  }
  if (path === '/v1/me/channels/email/verify' && req.method === 'POST') {
    const b = await readBody(req);
    if (!st.pendingEmail) return problem(res, 404, 'NOT_FOUND', 'no email code is waiting');
    if (b.code !== '246810') return problem(res, 403, 'FORBIDDEN', 'that is not the code');
    st.links.push({
      channel: 'email',
      address: `${st.pendingEmail[0]}***@${st.pendingEmail.split('@')[1]}`,
      since: new Date().toISOString(),
    });
    st.pendingEmail = null;
    return send(res, 200, {channel: 'email', linked: true});
  }
  const del = /^\/v1\/me\/channels\/(telegram|email)$/.exec(path);
  if (del && req.method === 'DELETE') {
    const before = st.links.length;
    st.links = st.links.filter((l) => l.channel !== del[1]);
    return send(res, 200, {channel: del[1], unlinked: st.links.length < before});
  }
  return problem(res, 404, 'NOT_FOUND', 'not found');
}

// ── the admin console (the API's routes/admin.ts, /v1/compliance) ──
// cara is on the arbiter DAO's council, rhea is a compliance reviewer.
// JOB(50) is disputed. Proposals and decisions are kept in memory.
const isCouncil = (a) => /^cara(-[a-z0-9-]+)?[.]testnet$/.test(a);
const isReviewer = (a) => /^rhea(-[a-z0-9-]+)?[.]testnet$/.test(a);
const DAO_ID = 'pactora-arbiter.sputnikv2.testnet';
const adminProposals = new Map();
const adminState = new Map();
const BASE_CASES = [
  {
    caseId: 'cccccccc-0000-4000-8000-000000000001',
    subjectAccount: 'held.testnet',
    source: 'ofac',
    entryRef: '2674',
    queryName: 'Abu Abbas',
    matchedName: 'ABBAS, Abu',
    score: 1,
    strength: 'strong',
    status: 'open',
    version: 1,
    decisions: [],
  },
];
const BASE_REVIEWS = [
  {
    reviewId: 'eeeeeeee-0000-4000-8000-000000000001',
    rating: 1,
    body: 'Abusive words go here.',
    authorRole: 'client',
    at: '2026-11-03T10:00:00.000Z',
    hidden: false,
    hiddenReason: null,
  },
];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const ruling = (jobId, forWorker) => ({
  FunctionCall: {
    receiver_id: 'pactora.testnet',
    actions: [
      {
        method_name: 'resolve_dispute',
        args: b64({job_id: jobId, for_worker: forWorker}),
        deposit: '0',
        gas: '50000000000000',
      },
    ],
  },
});

async function adminRoutes(req, res, path, account) {
  const isAdmin = path.startsWith('/v1/admin') || path.startsWith('/v1/compliance');
  if (!isAdmin) return null;
  if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
  const roles = [...(isCouncil(account) ? ['council'] : []), ...(isReviewer(account) ? ['reviewer'] : [])];
  // Each test account has its own copy, so parallel browsers never share one.
  if (!adminState.has(account))
    adminState.set(account, {cases: structuredClone(BASE_CASES), reviews: structuredClone(BASE_REVIEWS)});
  const {cases: adminCases, reviews: adminReviews} = adminState.get(account);
  if (roles.length === 0) return problem(res, 403, 'FORBIDDEN', 'admin only');
  const council = () =>
    roles.includes('council') ? null : problem(res, 403, 'FORBIDDEN', 'only the arbiter council may do this');
  if (path === '/v1/admin/me')
    return send(res, 200, {account, chainId: 'near:testnet', roles, arbiterDao: DAO_ID});
  if (path === '/v1/admin/disputes') {
    if (council() !== null) return;
    return send(res, 200, {
      arbiterDao: DAO_ID,
      disputes: [{jobId: JOB(50), chainJobId: '7050', amount: '4000000'}],
    });
  }
  const d = /^\/v1\/admin\/disputes\/([^/]+)(\/proposal|\/proposals(?:\/(\d+)\/vote)?)?$/.exec(path);
  if (d) {
    if (council() !== null) return;
    if (d[1] !== JOB(50)) return problem(res, 404, 'NOT_FOUND', 'no such dispute');
    const evidenceHash = 'ab'.repeat(32);
    if (!d[2]) {
      return send(res, 200, {
        jobId: JOB(50),
        chainJobId: '7050',
        state: 'disputed',
        amount: '4000000',
        resultHash: 'cd'.repeat(32),
        resultMismatch: false,
        client: {agentId: 11, name: 'Olive'},
        worker: {agentId: 22, name: 'Wade'},
        result: {answer: 'x'},
        disputeReason: 'The photos are of the wrong street. <b>not bold</b>',
        drafts: [{round: 1, snapshotHash: 'ef'.repeat(32), snapshot: {text: 'Both fronts photographed.'}}],
        files: [],
        messages: [
          {
            messageId: 'm1',
            from: 'worker',
            body: 'I went to the address given.',
            at: '2026-11-02T09:00:00.000Z',
          },
        ],
        timeline: [{kind: 'job.disputed', txHash: 'T9', at: '2026-11-02T10:00:00.000Z'}],
        evidenceHash,
      });
    }
    const list = adminProposals.get(account) ?? [];
    adminProposals.set(account, list);
    if (d[2] === '/proposal' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.evidenceHash !== evidenceHash)
        return problem(res, 409, 'INVALID_STATE', 'stale evidence: reload and look again');
      const kind = ruling(7050, Boolean(b.forWorker));
      list.push({
        id: list.length,
        proposer: account,
        description: `job ${JOB(50)}`,
        status: 'InProgress',
        votes: {},
        forWorker: Boolean(b.forWorker),
        youVoted: null,
        kind,
      });
      return send(res, 200, {
        dao: DAO_ID,
        functionCall: {
          receiverId: DAO_ID,
          methodName: 'add_proposal',
          args: {proposal: {description: `Pactora job ${JOB(50)}: evidence ${evidenceHash}`, kind}},
          gas: '100000000000000',
          deposit: '100000000000000000000000',
        },
      });
    }
    if (d[2] === '/proposals')
      return send(res, 200, {
        dao: DAO_ID,
        council: [account, 'x.testnet', 'y.testnet'],
        proposals: list.map(({kind, ...p}) => (void kind, p)),
      });
    if (d[3] !== undefined && req.method === 'POST') {
      const p = list.find((x) => String(x.id) === d[3]);
      if (!p) return problem(res, 404, 'NOT_FOUND', 'no such proposal');
      const b = await readBody(req);
      p.votes[account] = b.action === 'VoteApprove' ? 'Approve' : 'Reject';
      p.youVoted = p.votes[account];
      return send(res, 200, {
        dao: DAO_ID,
        functionCall: {
          receiverId: DAO_ID,
          methodName: 'act_proposal',
          args: {id: p.id, action: b.action, proposal: p.kind},
          gas: '300000000000000',
          deposit: '0',
        },
      });
    }
  }
  if (path === '/v1/admin/reviews') return send(res, 200, {reviews: adminReviews});
  const hide = /^\/v1\/admin\/reviews\/([^/]+)\/hide$/.exec(path);
  if (hide && req.method === 'POST') {
    const b = await readBody(req);
    if (String(b.reason ?? '').trim().length < 3)
      return problem(res, 422, 'SCHEMA_MISMATCH', 'reason is 3-500 characters');
    const r = adminReviews.find((x) => x.reviewId === hide[1]);
    if (!r) return problem(res, 404, 'NOT_FOUND', 'no such review');
    r.hidden = true;
    r.hiddenReason = b.reason;
    return send(res, 200, {reviewId: r.reviewId, hidden: true});
  }
  if (path.startsWith('/v1/compliance')) {
    if (!roles.includes('reviewer')) return problem(res, 403, 'FORBIDDEN', 'only compliance reviewers');
    if (path === '/v1/compliance/cases')
      return send(res, 200, {cases: adminCases.filter((c) => c.status === 'open')});
    const dc = /^\/v1\/compliance\/cases\/([^/]+)\/decisions$/.exec(path);
    if (dc && req.method === 'POST') {
      const c = adminCases.find((x) => x.caseId === dc[1]);
      const b = await readBody(req);
      if (!c) return problem(res, 404, 'NOT_FOUND', 'no case');
      if (String(b.reason ?? '').trim().length < 10)
        return problem(res, 422, 'SCHEMA_MISMATCH', 'reason is 10-2000 characters');
      if (b.caseVersion !== c.version) return problem(res, 409, 'INVALID_STATE', 'stale case');
      c.decisions.push({
        reviewer: account,
        decision: b.decision,
        reason: b.reason,
        at: new Date().toISOString(),
      });
      c.version++;
      return send(res, 201, {status: c.status, version: c.version, clearsSoFar: 1});
    }
  }
  return problem(res, 404, 'NOT_FOUND', 'not found');
}

// ── identity checks (the API's routes/kyc.ts) ──
// "Abu Abbas" is a strong sanctions match: the account is held and no
// session opens. Any other name opens a simulated session. Kept per account.
const kycOf = new Map();
async function kycRoutes(req, res, path, account, me) {
  if (!path.startsWith('/v1/kyc')) return null;
  if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
  if (!me) return problem(res, 403, 'FORBIDDEN', 'identity checks are for people');
  const s = kycOf.get(account) ?? {standing: 'clear', verification: null, session: null};
  kycOf.set(account, s);
  if (path === '/v1/kyc' && req.method === 'GET') {
    return send(res, 200, {
      standing: s.standing,
      provider: {name: 'simulated', simulated: true},
      screening: true,
      walletScreening: 'not available: no sanctions list names NEAR accounts',
      verification: s.verification,
    });
  }
  if (path === '/v1/kyc/start' && req.method === 'POST') {
    const b = await readBody(req);
    const name = String(b.legalName ?? '').trim();
    if (name.length < 2) return problem(res, 422, 'SCHEMA_MISMATCH', 'legalName is 2-200 characters');
    const v = {
      verificationId: `vvvvvvvv-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
      provider: 'simulated',
      status: 'pending',
      documentVerified: false,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    if (name.toLowerCase() === 'abu abbas') {
      s.standing = 'hold';
      s.verification = {...v, status: 'held'};
      return send(res, 202, {...s.verification, next: 'a compliance review is needed'});
    }
    s.session = `sim_${String(counter).padStart(24, 'a')}`;
    s.verification = v;
    return send(res, 201, {
      ...v,
      url: `http://localhost:3000/kyc/simulated?session=${s.session}`,
      simulated: true,
    });
  }
  const sim = /^\/v1\/kyc\/simulated\/([^/]+)$/.exec(path);
  if (sim && req.method === 'POST') {
    if (sim[1] !== s.session) return problem(res, 404, 'NOT_FOUND', 'no such session of yours');
    const b = await readBody(req);
    const ok = b.outcome === 'approved' && b.documentVerified !== false;
    s.verification = {
      ...s.verification,
      status: ok ? 'approved' : 'rejected',
      documentVerified: ok,
      decidedAt: new Date().toISOString(),
    };
    return send(res, 200, {status: s.verification.status, simulated: true});
  }
  return problem(res, 404, 'NOT_FOUND', 'not found');
}

// ── profiles and two-way reviews (the API's routes/profiles.ts) ──
// A directory of 23 published profiles (two people), with reviews on the
// first; anyone signed in has a profile they can edit (kept per account).
const DIR = Array.from({length: 23}, (_, i) => ({
  profileId: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  kind: i < 2 ? 'person' : 'agent',
  displayName: i === 0 ? 'Priya Photos' : i === 1 ? 'Wade Writes' : `Agent ${String(i).padStart(2, '0')}`,
  headline: i === 0 ? 'Shop fronts in Pune, 100% on time' : '',
  bio: i === 0 ? 'I photograph shop fronts.\n<b>not bold</b>' : '',
  account: i === 0 ? 'priya.testnet' : null,
  location: i === 0 ? 'Pune' : null,
  capabilities: i === 0 ? ['photography'] : i > 1 ? ['market-research'] : [],
  rating: i === 0 ? {average: 4.5, count: 2} : i === 2 ? {average: 3, count: 1} : {average: null, count: 0},
  settledJobs: i === 0 ? 3 : 0,
  chainAgentId: i > 1 ? String(i) : null,
  publishedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
  reviews:
    i === 0
      ? [
          {
            reviewId: 'rv-1',
            rating: 5,
            body: 'Sharp photos, on time.',
            authorRole: 'client',
            author: 'Olive',
            jobId: JOB(1),
            at: '2026-11-03T10:00:00.000Z',
          },
          {
            reviewId: 'rv-2',
            rating: 4,
            body: 'Good, one retake needed.',
            authorRole: 'client',
            author: null,
            jobId: JOB(1),
            at: '2026-11-02T10:00:00.000Z',
          },
        ]
      : [],
}));
const myProfiles = new Map();
const partyReviewsOf = new Map();

async function profileRoutes(req, res, path, account, me, url) {
  if (path === '/v1/profiles' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const kind = url.searchParams.get('kind');
    const sort = url.searchParams.get('sort') ?? 'rating';
    const page = Number(url.searchParams.get('page') ?? 1);
    let rows = DIR.filter(
      (p) =>
        (!kind || p.kind === kind) &&
        (!q || p.displayName.toLowerCase().includes(q) || p.headline.toLowerCase().includes(q)),
    );
    rows = [...rows].sort((a, b) =>
      sort === 'name'
        ? a.displayName.localeCompare(b.displayName)
        : sort === 'recent'
          ? b.publishedAt.localeCompare(a.publishedAt)
          : (b.rating.average ?? -1) - (a.rating.average ?? -1),
    );
    const view = (p) => {
      const {bio, reviews, ...rest} = p;
      void bio;
      void reviews;
      return rest;
    };
    return send(res, 200, {
      total: rows.length,
      page,
      pageSize: 20,
      sort,
      profiles: rows.slice((page - 1) * 20, page * 20).map(view),
    });
  }
  const one = /^\/v1\/profiles\/([^/]+)$/.exec(path);
  if (one && req.method === 'GET') {
    const p = DIR.find((x) => x.profileId === one[1]);
    return p ? send(res, 200, p) : problem(res, 404, 'NOT_FOUND', 'no published profile');
  }
  if (path === '/v1/me/profile') {
    if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
    if (!me) return problem(res, 403, 'FORBIDDEN', 'no person agent');
    if (req.method === 'GET') {
      const saved = myProfiles.get(account);
      return send(
        res,
        200,
        saved
          ? {exists: true, ...saved, profileId: 'dddddddd-0000-4000-8000-000000000001'}
          : {
              exists: false,
              published: false,
              displayName: PEOPLE[account]?.name ?? account,
              headline: '',
              bio: '',
              showAccount: false,
            },
      );
    }
    if (req.method === 'PUT') {
      const b = await readBody(req);
      const name = String(b.displayName ?? '').trim();
      if (name.length < 1 || name.length > 60)
        return problem(res, 422, 'SCHEMA_MISMATCH', 'displayName is 1-60 characters');
      myProfiles.set(account, {
        displayName: name,
        headline: b.headline ?? '',
        bio: b.bio ?? '',
        showAccount: Boolean(b.showAccount),
        published: Boolean(b.published),
      });
      return send(res, 200, {
        profileId: 'dddddddd-0000-4000-8000-000000000001',
        published: Boolean(b.published),
      });
    }
  }
  const pr = /^\/v1\/jobs\/([^/]+)\/party-reviews$/.exec(path);
  if (pr) {
    const j = jobs.get(pr[1]);
    if (!j) return problem(res, 404, 'NOT_FOUND', 'no such job');
    if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
    const role = j.worker === me ? 'worker' : j.client === me ? 'client' : null;
    if (!role) return problem(res, 403, 'FORBIDDEN', 'only the two parties review a job');
    const store = partyReviewsOf.get(j.jobId) ?? {};
    partyReviewsOf.set(j.jobId, store);
    const settled = j.state === 'settled';
    const closesAt = settled
      ? new Date(Date.parse(j.settledAt ?? '2026-11-02T10:00:00.000Z') + 14 * 86_400_000).toISOString()
      : null;
    const open = settled && j.reviewWindow !== 'closed';
    if (req.method === 'POST') {
      if (!settled) return problem(res, 409, 'INVALID_STATE', 'a job is reviewed after it settles on chain');
      if (!open) return problem(res, 410, 'DEADLINE_PASSED', 'the review window closed');
      const b = await readBody(req);
      if (!Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5)
        return problem(res, 422, 'SCHEMA_MISMATCH', 'rating is 1-5');
      const body = String(b.body ?? '').trim();
      if (body.length < 10 || body.length > 2000)
        return problem(res, 422, 'SCHEMA_MISMATCH', 'body is 10-2000 characters');
      if (store[role]) return problem(res, 409, 'IDEMPOTENCY_CONFLICT', 'already reviewed');
      store[role] = {
        reviewId: `rv-${++counter}`,
        rating: b.rating,
        body,
        authorRole: role,
        at: new Date().toISOString(),
        hidden: false,
      };
      return send(res, 201, {...store[role], replayed: false});
    }
    const other = role === 'client' ? 'worker' : 'client';
    const revealed = Boolean(store[role] && store[other]);
    return send(res, 200, {
      jobId: j.jobId,
      role,
      window: {open, settledOnChain: settled, closesAt},
      mine: store[role] ?? null,
      theirs: store[other] ? (revealed ? store[other] : {submitted: true}) : null,
      revealed,
    });
  }
  return null;
}

/** Test hook: the other party writes their review (as if from their own browser). */
function otherPartyReviews(jobId, role) {
  const store = partyReviewsOf.get(jobId) ?? {};
  partyReviewsOf.set(jobId, store);
  store[role] = {
    reviewId: `rv-${++counter}`,
    rating: 3,
    body: 'Clear brief, slow to reply.',
    authorRole: role,
    at: new Date().toISOString(),
    hidden: false,
  };
}

// ── notifications and the faucet (the API's routes/agent-events.ts, faucet.ts) ──
// Accounts named `nell-<anything>.testnet` are people with a seeded feed of
// 25 notifications (3 unread); `fay-<anything>.testnet` people with a faucet
// to claim from. Each test names its own (with the browser in it), so the
// browsers sharing this server never share state; /__test/feed/reset puts
// one back.
const feeds = new Map();
const faucetClaimed = new Set();
const FEED_KINDS = ['job.created', 'job.accepted', 'job.draft.submitted', 'job.message', 'settled'];
function feedOf(account) {
  if (!feeds.has(account)) {
    const items = Array.from({length: 25}, (_, i) => ({
      seq: i + 1,
      kind: FEED_KINDS[i % FEED_KINDS.length],
      role: i % 2 ? 'worker' : 'client',
      jobId: JOB(1),
      payload: {},
      at: new Date(Date.UTC(2026, 10, 2, 9, i)).toISOString(),
    }));
    feeds.set(account, {items, readSeq: 22});
  }
  return feeds.get(account);
}
const isFeedPerson = (account) => /^(nell|fay)-[a-z0-9-]+\.testnet$/.test(account ?? '');

async function feedRoutes(req, res, path, account, me, url) {
  if (path !== '/v1/notifications' && path !== '/v1/notifications/read' && path !== '/v1/faucet') return null;
  if (!account) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');
  if (path === '/v1/faucet') {
    const known = isFeedPerson(account) || Boolean(me);
    if (!known) return problem(res, 403, 'FORBIDDEN', 'no person');
    if (req.method === 'GET')
      return send(res, 200, {
        available: true,
        testnet: true,
        amount: '5000000',
        claimedToday: faucetClaimed.has(account),
        day: new Date().toISOString().slice(0, 10),
        remainingToday: '495000000',
      });
    if (faucetClaimed.has(account))
      return problem(res, 409, 'LIMIT_REACHED', `${account} already claimed today`);
    faucetClaimed.add(account);
    const tx = `FAUCET${++counter}`;
    return send(res, 201, {
      account,
      amount: '5000000',
      txHash: tx,
      explorerUrl: `${EXPLORER}/txns/${tx}`,
      registered: true,
      from: 'faucet.testnet',
    });
  }
  if (!isFeedPerson(account) && !me) return problem(res, 403, 'FORBIDDEN', 'no person agent');
  const f = isFeedPerson(account) ? feedOf(account) : {items: [], readSeq: 0};
  const latest = f.items.length;
  if (path === '/v1/notifications/read') {
    const body = await readBody(req);
    const upTo = Math.min(Number(body.upTo ?? 0), latest);
    f.readSeq = Math.max(f.readSeq, upTo);
    return send(res, 200, {readSeq: f.readSeq, latest, unread: latest - f.readSeq});
  }
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const before = url.searchParams.get('before');
  const rows = f.items
    .filter((x) => !before || x.seq < Number(before))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, limit);
  const oldest = rows.at(-1)?.seq;
  return send(res, 200, {
    unread: latest - f.readSeq,
    readSeq: f.readSeq,
    latest,
    before: oldest !== undefined && oldest > 1 ? oldest : null,
    notifications: rows.map((x) => ({...x, read: x.seq <= f.readSeq})),
  });
}

// ── delivery: files, drafts and review, chat (the API's routes/files.ts, drafts.ts, messages.ts) ──
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);
const LIMITS = {maxActive: 10, maxTotal: 30, maxBytes: 8 * 1024 * 1024};
const filesById = new Map();

function phaseOf(j) {
  const last = j.drafts.at(-1);
  if (!last) return 'none';
  if (j.drafts.some((d) => d.review?.decision === 'accept_draft')) return 'accepted';
  if (!last.review) return 'awaiting_review';
  return last.review.decision === 'revise' ? 'revise' : 'dispute_intent';
}
function draftSummary(j) {
  const phase = phaseOf(j);
  const acc = j.drafts.find((d) => d.review?.decision === 'accept_draft');
  const used = j.drafts.filter((d) => d.review?.decision === 'revise').length;
  return {
    jobId: j.jobId,
    phase,
    revisionsUsed: used,
    revisionsLeft: Math.max(0, 3 - used),
    acceptedSnapshotHash: acc?.snapshotHash ?? null,
    acceptedReviewHash: acc?.review?.reviewHash ?? null,
    readyToApprove: Boolean(
      acc && j.state === 'submitted' && !j.resultMismatch && j.resultHash === acc.snapshotHash,
    ),
    resultMismatch: j.resultMismatch,
  };
}
const fileView = (f) => ({
  fileId: f.fileId,
  sha256: f.sha256,
  mime: f.mime,
  size: f.bytes.length,
  createdAt: f.createdAt,
  withdrawnAt: f.withdrawnAt,
  url: `/v1/files/${f.fileId}`,
});
function mimeOf(b) {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length > 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}
async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
/** The bytes of the multipart part named `file`. */
function filePart(req, raw) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(req.headers['content-type'] ?? '');
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let at = raw.indexOf(boundary);
  while (at !== -1) {
    const next = raw.indexOf(boundary, at + boundary.length);
    if (next === -1) break;
    const part = raw.subarray(at + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1 && /name="file"/.test(part.subarray(0, split).toString('latin1')))
      return part.subarray(split + 4);
    at = next;
  }
  return null;
}
const snapshotOf = (j, round, text) => ({
  v: 1,
  jobId: j.jobId,
  specHash: '0x' + 'ab'.repeat(32),
  round,
  terms: j.spec.input,
  text,
  output: null,
  files: j.files
    .filter((f) => !f.withdrawnAt)
    .map((f) => ({fileId: f.fileId, sha256: f.sha256, mime: f.mime, size: f.bytes.length})),
  messages: j.messages.slice(-100),
});

async function delivery(req, res, path, me) {
  const fileGet = /^\/v1\/files\/([^/]+)$/.exec(path);
  const m = /^\/v1\/jobs\/([^/]+)\/(files|drafts|messages)(?:\/([^/]+))?(\/review)?$/.exec(path);
  if (!fileGet && !m) return null;
  if (!me) return problem(res, 401, 'UNAUTHORIZED', 'a session is needed');

  if (fileGet) {
    const f = filesById.get(fileGet[1]);
    const j = f && jobs.get(f.jobId);
    if (!f || !j || (j.client !== me && j.worker !== me))
      return problem(res, 404, 'NOT_FOUND', 'no such file');
    res.writeHead(200, {
      'content-type': f.mime,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
      'x-sha256': f.sha256,
      'access-control-allow-origin': '*',
    });
    return res.end(f.bytes);
  }

  const j = jobs.get(m[1]);
  if (!j) return problem(res, 404, 'NOT_FOUND', 'no such job');
  const role = j.worker === me ? 'worker' : j.client === me ? 'client' : null;
  if (!role) return problem(res, 403, 'FORBIDDEN', 'only the two parties may see this delivery');
  if (!j.drafts) return problem(res, 409, 'INVALID_STATE', 'not a listing job');
  const kind = m[2];

  if (kind === 'files') {
    if (req.method === 'GET')
      return send(res, 200, {
        jobId: j.jobId,
        active: j.files.filter((f) => !f.withdrawnAt).length,
        total: j.files.length,
        limits: LIMITS,
        files: j.files.map(fileView),
      });
    if (role !== 'worker') return problem(res, 403, 'FORBIDDEN', 'only the worker uploads');
    if (j.state !== 'accepted') return problem(res, 409, 'INVALID_STATE', `job is ${j.state}`);
    if (req.method === 'DELETE' && m[3]) {
      const f = j.files.find((x) => x.fileId === m[3]);
      if (!f) return problem(res, 404, 'NOT_FOUND', 'no such file');
      const replayed = Boolean(f.withdrawnAt);
      f.withdrawnAt ??= new Date().toISOString();
      return send(res, 200, {jobId: j.jobId, ...fileView(f), replayed});
    }
    if (req.method === 'POST') {
      const bytes = filePart(req, await rawBody(req));
      if (!bytes) return problem(res, 400, 'VALIDATION', 'a multipart field `file` is needed');
      if (bytes.length > LIMITS.maxBytes) return problem(res, 413, 'PAYLOAD_TOO_LARGE', 'at most 8 MiB');
      const mime = mimeOf(bytes);
      if (!mime) return problem(res, 415, 'UNSUPPORTED_MEDIA', 'only PNG, JPEG or WebP, by its bytes');
      if (j.files.filter((f) => !f.withdrawnAt).length >= LIMITS.maxActive)
        return problem(res, 409, 'LIMIT_REACHED', 'at most 10 active files');
      const f = {
        fileId: randomUUID(),
        jobId: j.jobId,
        bytes,
        mime,
        sha256: sha256(bytes),
        createdAt: new Date().toISOString(),
        withdrawnAt: null,
      };
      j.files.push(f);
      filesById.set(f.fileId, f);
      return send(res, 201, {jobId: j.jobId, ...fileView(f), metadataRemoved: []});
    }
  }

  if (kind === 'drafts') {
    if (req.method === 'GET') return send(res, 200, {...draftSummary(j), role, drafts: j.drafts});
    const body = await readBody(req);
    if (!m[3] && req.method === 'POST') {
      if (role !== 'worker') return problem(res, 403, 'FORBIDDEN', 'only the worker posts drafts');
      if (j.state !== 'accepted') return problem(res, 409, 'INVALID_STATE', `job is ${j.state}`);
      const phase = phaseOf(j);
      if (phase !== 'none' && phase !== 'revise')
        return problem(res, 409, 'INVALID_STATE', `drafts are ${phase}`);
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (text.length < 10 || text.length > 10_000)
        return problem(res, 400, 'VALIDATION', 'text is 10-10000 characters');
      const snapshot = snapshotOf(j, j.drafts.length + 1, text);
      const d = {
        draftId: randomUUID(),
        round: snapshot.round,
        snapshotHash: sha256(canonical(snapshot)),
        snapshot,
        createdAt: new Date().toISOString(),
        review: null,
      };
      j.drafts.push(d);
      pushEvent(j, 'job.draft.submitted', null);
      return send(res, 201, {...draftSummary(j), ...d, replayed: false});
    }
    if (m[3] && m[4] && req.method === 'POST') {
      if (role !== 'client') return problem(res, 403, 'FORBIDDEN', 'only the client reviews');
      const d = j.drafts.find((x) => x.draftId === m[3]);
      if (!d) return problem(res, 404, 'NOT_FOUND', 'no such draft');
      if (d.review)
        return problem(res, 409, 'IDEMPOTENCY_CONFLICT', `already reviewed: ${d.review.decision}`);
      if (body.snapshotHash !== d.snapshotHash || j.drafts.at(-1) !== d)
        return problem(res, 409, 'INVALID_STATE', 'stale snapshot');
      if (!['revise', 'accept_draft', 'dispute_intent'].includes(body.decision))
        return problem(res, 400, 'VALIDATION', 'unknown decision');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 10 || reason.length > 2000)
        return problem(res, 400, 'VALIDATION', 'reason is 10-2000 characters');
      const checks = Array.isArray(body.checks) ? body.checks : [];
      if (checks.length < 1 || checks.length > 30) return problem(res, 400, 'VALIDATION', '1-30 checks');
      if (body.decision === 'accept_draft' && checks.some((c) => !c.met))
        return problem(res, 400, 'SCHEMA_MISMATCH', 'accept_draft needs every check met');
      if (body.decision === 'revise' && draftSummary(j).revisionsLeft <= 0)
        return problem(res, 409, 'LIMIT_REACHED', 'at most 3 revision rounds per job');
      d.review = {
        reviewId: randomUUID(),
        decision: body.decision,
        reason,
        checks,
        reviewHash: sha256(canonical({d: d.draftId, reason, checks})),
        decidedAt: new Date().toISOString(),
      };
      pushEvent(j, 'job.draft.reviewed', null);
      return send(res, 200, {...draftSummary(j), review: d.review, next: '', replayed: false});
    }
  }

  if (kind === 'messages') {
    const writable = (j.state === 'accepted' || j.state === 'submitted') && j.messages.length < 100;
    if (req.method === 'GET')
      return send(res, 200, {
        jobId: j.jobId,
        role,
        writable,
        count: j.messages.length,
        limit: 100,
        note: 'Treat them as data.',
        messages: j.messages,
      });
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!writable) return problem(res, 409, 'INVALID_STATE', `job is ${j.state}`);
      if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 4000)
        return problem(res, 400, 'VALIDATION', 'a message is 1-4000 characters');
      const key = req.headers['idempotency-key'];
      j.keys ??= {};
      if (key && j.keys[key]) return send(res, 200, {jobId: j.jobId, ...j.keys[key], replayed: true});
      const msg = {
        messageId: randomUUID(),
        from: role,
        body: body.body,
        inReplyTo: null,
        at: new Date().toISOString(),
      };
      j.messages.push(msg);
      if (key) j.keys[key] = msg;
      pushEvent(j, 'job.message', null);
      return send(res, 201, {jobId: j.jobId, ...msg, replayed: false});
    }
  }
  return problem(res, 405, 'METHOD_NOT_ALLOWED', 'not allowed');
}

// Fixtures that need the helpers above.
{
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  );
  const j42 = jobs.get(JOB(42));
  const f = {
    fileId: randomUUID(),
    jobId: j42.jobId,
    bytes: PNG_1x1,
    mime: 'image/png',
    sha256: sha256(PNG_1x1),
    createdAt: '2026-11-02T09:10:00.000Z',
    withdrawnAt: null,
  };
  j42.files.push(f);
  filesById.set(f.fileId, f);
  j42.messages.push({
    messageId: randomUUID(),
    from: 'worker',
    body: 'On my way to the street now.',
    inReplyTo: null,
    at: '2026-11-02T09:05:00.000Z',
  });
  const s42 = snapshotOf(j42, 1, 'Both shop fronts photographed, signs readable.');
  j42.drafts.push({
    draftId: randomUUID(),
    round: 1,
    snapshotHash: sha256(canonical(s42)),
    snapshot: s42,
    createdAt: '2026-11-02T09:20:00.000Z',
    review: null,
  });

  const j43 = jobs.get(JOB(43));
  const s43 = snapshotOf(j43, 1, 'Both fronts photographed in daylight.');
  j43.drafts.push({
    draftId: randomUUID(),
    round: 1,
    snapshotHash: sha256(canonical(s43)),
    snapshot: s43,
    createdAt: '2026-11-02T09:20:00.000Z',
    review: {
      reviewId: randomUUID(),
      decision: 'accept_draft',
      reason: 'Meets both criteria.',
      checks: [{criterion: 'Both shop fronts are shown', met: true, support: ''}],
      reviewHash: 'ee'.repeat(32),
      decidedAt: '2026-11-02T09:30:00.000Z',
    },
  });
}

/** Test hooks: what the chain would do, and what the tests need to read back. */
async function hooks(req, res, url) {
  const cl = /^\/__test\/clone\/(listing|job)\/([^/]+)$/.exec(url.pathname);
  if (cl && req.method === 'POST') {
    if (cl[1] === 'listing') {
      const t = listings.get(cl[2]);
      if (!t) return send(res, 404, {code: 'NOT_FOUND', detail: 'no listing'});
      const id = `${cl[2]}-x${++counter}`;
      listings.set(id, {...structuredClone(t), listingId: id});
      return send(res, 200, {id});
    }
    const t = jobs.get(cl[2]);
    if (!t) return send(res, 404, {code: 'NOT_FOUND', detail: 'no job'});
    const id = `cccccccc-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
    const {streams, confirmed, attempts, prepared, ...plain} = t;
    void streams;
    void confirmed;
    void attempts;
    void prepared;
    const copy = {...structuredClone(plain), jobId: id, streams: new Set(), confirmed: {}};
    for (const f of copy.files ?? []) {
      f.bytes = Buffer.from(f.bytes);
      f.jobId = id;
      f.fileId = randomUUID();
      filesById.set(f.fileId, f);
    }
    // The snapshot's file ids follow the copies, so a draft still lists photos that exist.
    for (const d of copy.drafts ?? [])
      d.snapshot.files = copy.files.map((f) => ({
        fileId: f.fileId,
        sha256: f.sha256,
        mime: f.mime,
        size: f.bytes.length,
      }));
    jobs.set(id, copy);
    return send(res, 200, {id});
  }
  const adv = /^\/__test\/job\/([^/]+)\/advance$/.exec(url.pathname);
  if (adv) {
    const j = jobs.get(adv[1]);
    if (!j) return send(res, 404, {code: 'NOT_FOUND', detail: 'no job'});
    j.state = 'submitted';
    pushEvent(j, 'job.submitted', 'LIVETX1');
    return send(res, 200, {state: j.state});
  }
  // A person record for a test's own account, so parallel browsers never share one.
  const newPerson = /^\/__test\/person\/([a-z0-9-]+\.testnet)$/.exec(url.pathname);
  if (newPerson) {
    PEOPLE[newPerson[1]] = {agentId: '77', chainAgentId: '177', name: 'Pat', capabilities: []};
    myProfiles.delete(newPerson[1]);
    channelState.delete(newPerson[1]);
    kycOf.delete(newPerson[1]);
    return send(res, 200, {account: newPerson[1]});
  }
  const theirs = /^\/__test\/job\/([^/]+)\/their-review\/(client|worker)$/.exec(url.pathname);
  if (theirs) {
    otherPartyReviews(theirs[1], theirs[2]);
    return send(res, 200, {ok: true});
  }
  const feedReset = /^\/__test\/feed\/reset\/([^/]+)$/.exec(url.pathname);
  if (feedReset) {
    feeds.delete(feedReset[1]);
    faucetClaimed.delete(feedReset[1]);
    return send(res, 200, {reset: feedReset[1]});
  }
  if (url.pathname === '/__test/created') {
    return send(res, 200, Object.fromEntries(created));
  }
  const prepared = /^\/__test\/job\/([^/]+)\/prepared$/.exec(url.pathname);
  if (prepared)
    return send(res, 200, {
      prepared: jobs.get(prepared[1])?.prepared ?? [],
      confirmCount: jobs.get(prepared[1])?.confirmCount ?? 0,
    });
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (url.pathname.startsWith('/v1/session') || url.pathname === '/v1/people') {
    if ((await people(req, res, url)) !== null) return;
    return send(res, 404, {code: 'NOT_FOUND', detail: 'not found'});
  }
  if (url.pathname.startsWith('/__test/')) {
    if ((await hooks(req, res, url)) !== null) return;
    return send(res, 404, {code: 'NOT_FOUND', detail: 'not found'});
  }
  if (
    url.pathname === '/v1/me' ||
    url.pathname.startsWith('/v1/me/') ||
    url.pathname.startsWith('/v1/listings') ||
    url.pathname.startsWith('/v1/files/') ||
    url.pathname.startsWith('/v1/notifications') ||
    url.pathname === '/v1/faucet' ||
    url.pathname.startsWith('/v1/profiles') ||
    url.pathname.startsWith('/v1/kyc') ||
    url.pathname.startsWith('/v1/admin') ||
    url.pathname.startsWith('/v1/compliance') ||
    (url.pathname.startsWith('/v1/jobs') && !url.pathname.startsWith(`/v1/jobs/${JOB_ID}`))
  ) {
    if ((await market(req, res, url)) !== null) return;
    return send(res, 404, {code: 'NOT_FOUND', detail: 'not found'});
  }
  if (url.pathname === '/v1/network') return send(res, 200, network);
  if (url.pathname === '/v1/status') return send(res, 200, status());
  // Registering an agent (/register): the signer's key for the new account,
  // the owner's challenge, then the record (the API's routes/agents.ts).
  if (url.pathname === '/v1/agents/wallet-key' && req.method === 'POST')
    return send(res, 200, {walletPublicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp'});
  if (url.pathname === '/v1/agents/challenge' && req.method === 'POST')
    return send(res, 201, {
      nonce: 'cd'.repeat(32),
      message: 'Pactora: register an agent.',
      recipient: 'pactora',
    });
  if (url.pathname === '/v1/agents' && req.method === 'POST') {
    const b = await readBody(req);
    return send(res, 201, {
      agentId: 101,
      chainId: 'near:testnet',
      walletAddress: b.walletAddress,
      apiKey: `ax_${'1'.repeat(16)}_${'2'.repeat(32)}`,
      warning: 'Store the API key now: it is shown once.',
    });
  }
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
