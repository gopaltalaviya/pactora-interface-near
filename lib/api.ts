/**
 * The browser's view of the Pactora API.
 *
 * ## Why this is not `@pactora/sdk`
 *
 * The SDK lives in `pactora-backend-near`, which is a separate repository on
 * purpose: the contracts and the signer must never enter a Vercel build
 * container. Importing across that line would mean either publishing the SDK
 * or giving the hosting build a deploy key to a private repo — both worse
 * than a small duplicated surface.
 *
 * So these types are a COPY, and a copy drifts. The guard is
 * `scripts/check-api-contract.mjs`: it calls a running API and asserts every
 * field this file claims actually exists. A type that agrees with itself
 * proves nothing; one checked against the real server does.
 *
 * Only read endpoints appear here. Anything that spends is done by an agent
 * holding its own key, never by a browser.
 */

// A production build without NEXT_PUBLIC_API_URL fails in next.config.mjs,
// so this fallback only ever serves `next dev` and the tests.
export const API_URL = process.env['NEXT_PUBLIC_API_URL']?.replace(/\/$/, '') ?? 'http://127.0.0.1:8080';

/**
 * A network key: a CAIP-2 string, `near:testnet` (NEAR-PORT §1). Accounts
 * (`ownerAddress`, `walletAddress`, contracts) are NEAR account ids.
 */
export type ChainId = string;

/** `GET /v1/network` (NEAR-PORT §4). */
export interface NetworkInfo {
  chainId: ChainId;
  /** What the RPC's `status.chain_id` answers: `testnet`. */
  nearNetworkId: string;
  name: string;
  shortName?: string;
  testnet: boolean;
  /** `accountId` is the token contract; null until it is deployed. */
  paymentToken: {symbol: string; decimals: number; accountId: string | null};
  contracts: {Pactora: string; PaymentToken: string; Arbiter: string};
  rpcUrls: string[];
  nativeCurrency: {name: string; symbol: string; decimals: number};
  explorerBaseUrl: string | null;
  faucetUrls?: string[];
  enabledChains?: ChainId[];
  fastPathMaxDisplay: string;
  protocolFeeBps: number;
  /** The smallest job the escrow accepts, in base units. A cheaper agent can never be hired. */
  minJobAmount?: string;
  minFee?: string;
  windows?: {accept: number; work: number; review: number; dispute: number};
  // v3 fees and limits. Optional: an older API does not publish them, and the
  // fees page then says so rather than showing a number from somewhere else.
  // Amounts are base-unit strings of the payment token; bps are numbers.
  /** The worker's bond, as a share of the job, locked from its stake when it accepts. */
  bondBps?: number;
  minBond?: string;
  /** The client's dispute bond, as a share of the job. */
  disputeBondBps?: number;
  minDisputeBond?: string;
  /** The largest job the escrow accepts. */
  maxJobAmount?: string;
  /** The caps a new agent account starts with. */
  defaultPerTaskCap?: string;
  defaultDailyCap?: string;
  /** The stake an agent needs to be listed as a worker. */
  minStake?: string;
  /** How long a stake withdrawal waits. */
  withdrawDelaySeconds?: number;
}

export interface AgentSummary {
  agentId: number;
  chainId: ChainId;
  /** The agent's id in the Pactora contract (u64, decimal string), once registered there. */
  chainAgentId?: string | number | null;
  name: string;
  description: string | null;
  capabilities: string[];
  pricePerTask: string;
  priceDisplay: string;
  walletAddress: string;
  score: number;
  completed: number;
  failed: number;
  successRate: number | null;
  active: boolean;
  explorerUrl: string;
  /** When the list was filtered by a capability: the record in that skill alone. */
  skill?: SkillStat;
  /** On a single agent's profile: every skill it offers or has a record in. */
  skills?: SkillStat[];
}

/** Reputation in one skill, counted and scored the same way as the overall figures. */
export interface SkillStat {
  capability: string;
  completed: number;
  failed: number;
  successRate: number | null;
  score: number;
}

/** `GET /v1/jobs/:id`, the part the run record reads: what happened on chain, and where. */
export interface JobEvents {
  events: {kind: string; explorerUrl: string | null}[];
}

export interface RunSummary {
  runId: string;
  chainId: ChainId;
  network: string;
  testnet: boolean;
  goal: string;
  state: 'running' | 'done' | 'failed';
  spent: string;
  spentDisplay: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface RunDetail extends RunSummary {
  answer: string | null;
  steps: RunStep[];
  error: string | null;
  events: {kind: string; payload: Record<string, unknown>; occurredAt: string}[];
}

export interface RunStep {
  capability: string;
  status:
    | 'settled'
    | 'disputed'
    | 'unrecoverable'
    | 'no-candidate'
    | 'budget-exceeded'
    | 'declined'
    | 'timeout'
    | 'failed';
  /** Set when a second worker delivered: why the first did not. */
  retriedAfter?: string;
  detail: string;
  jobId?: string;
  agentId?: number;
  amount?: string;
  explorerUrl?: string;
  verdict?: {accept: boolean; reason: string; quality: number; injectionAttempted: boolean};
}

/** The event kinds the orchestrator emits, plus the two terminal ones. */
export type RunEventKind =
  | 'planned'
  | 'plan-failed'
  | 'discovered'
  /** v3: left out of the pool by the trust check, before the model chose. */
  | 'excluded'
  | 'selected'
  | 'hired'
  | 'judged'
  | 'settled'
  | 'disputed'
  | 'retrying'
  | 'skipped'
  | 'finished'
  | 'failed';

export interface RunEvent {
  kind: RunEventKind;
  payload: Record<string, unknown>;
  /** Client-side, for ordering and for the elapsed column. */
  at: number;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Messages for the two failures that are not the API speaking. */
export const UNREACHABLE = 'Cannot reach the Pactora API — check your connection, or see the status page.';
export const UNAVAILABLE =
  'Pactora is temporarily unavailable — a service it depends on is down. Try again in a moment.';
export const BAD_RESPONSE =
  'The API sent an unexpected answer (not a valid response) — often a proxy or a deploy in progress. Try again in a moment.';

// These are shared by reads AND writes, so none of them claims "nothing was
// spent": after a 5xx or a dropped connection on POST /v1/runs the site cannot
// know that. Read-only pages say it themselves, where it is true.
/**
 * Every request goes through here, so every failure reads the same way:
 * the API's own RFC 7807 problem when it sent one; otherwise one of two
 * sentences a person can act on — never "Failed to fetch" or a JSON parser's
 * "Unexpected token '<'".
 */
async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {cache: 'no-store', ...init});
  } catch (err) {
    if ((err as {name?: string})?.name === 'AbortError') throw err;
    throw new ApiError('UNREACHABLE', UNREACHABLE);
  }
  const text = await res.text().catch(() => '');
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const problem = (body ?? {}) as {code?: string; detail?: string};
    // A 5xx is never the visitor's to fix, and its detail (if any) is written
    // for an operator: say what it means for them instead.
    if (res.status === 503 || problem.code === 'UPSTREAM_UNAVAILABLE')
      throw new ApiError('UPSTREAM_UNAVAILABLE', UNAVAILABLE);
    if (res.status >= 500)
      throw new ApiError(
        problem.code ?? 'UPSTREAM_UNAVAILABLE',
        `The API had a problem (${res.status}). Try again in a moment.`,
      );
    throw new ApiError(problem.code ?? 'UNKNOWN', problem.detail ?? `${fallback} (${res.status})`);
  }
  if (body === undefined) throw new ApiError('BAD_RESPONSE', BAD_RESPONSE);
  return body as T;
}

function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, signal ? {signal} : {}, `${path} failed`);
}

export interface RegisteredAgent {
  agentId: number;
  chainId: ChainId;
  walletAddress: string;
  apiKey: string;
  warning: string;
}

/**
 * `GET /v1/status` — public by design: states and numbers only, never a host,
 * URL or error message. See pactora-backend-near apps/api/src/routes/status.ts.
 */
export type ComponentStatus = 'up' | 'degraded' | 'down' | 'unknown';

/** The AI model the hosted runs think with, from real run outcomes. Older APIs omit it. */
export interface ModelStatus {
  state: 'ok' | 'limited' | 'unknown';
  since: string | null;
  detail: string | null;
  lastDelivered: {runId: string; at: string} | null;
}

/** NEAR in the accounts the signer sends from, in yoctoNEAR (24 decimals). Absent from an older API. */
export interface GasStatus {
  state: 'ok' | 'low' | 'unknown';
  checkedAt: string | null;
  wallets: {address: string; role: string; balanceYocto: string; low: boolean}[];
}

export interface StatusReport {
  status: 'operational' | 'degraded' | 'down';
  model?: ModelStatus;
  gas?: GasStatus;
  checkedAt: string;
  build: {service: string; version: string; commit: string; builtAt: string | null} | null;
  components: {
    api: ComponentStatus;
    database: ComponentStatus;
    signer: ComponentStatus;
    rpc: ComponentStatus;
    indexer: ComponentStatus;
  };
  chains: {
    chainId: ChainId;
    name: string;
    testnet: boolean;
    rpc: ComponentStatus;
    headBlock: number | null;
    indexer: {
      status: ComponentStatus;
      indexedBlock: number | null;
      lagBlocks: number | null;
      lastIndexedAt: string | null;
      secondsSinceIndexed: number | null;
    };
  }[];
}

/** GET /v1/agents/:id/trust (v3): the verdict, its reasons and the numbers behind them. */
export interface TrustReport {
  agentId: string;
  chainId: ChainId;
  verdict: 'trusted' | 'new' | 'concentrated' | 'self-funded' | 'failing';
  reasons: string[];
  metrics: {
    settled: number;
    failed: number;
    volume: string;
    clientOwners: number;
    topOwnerSettled: number;
    selfFunded: number;
    trustScore: number;
  };
  fundingWindowBlocks: number;
  indexedToBlock: string | null;
}

/** `POST /v1/agents/challenge` (NEAR-PORT §5). `nonce` is 32 bytes as 64 hex. */
export interface Challenge {
  nonce: string;
  message: string;
  recipient: string;
  expiresAt: string;
  /** `ed25519:…`, the key the signer holds for `walletAddress`. */
  walletPublicKey: string;
}

export const api = {
  network: (signal?: AbortSignal) => get<NetworkInfo>('/v1/network', signal),

  status: (signal?: AbortSignal) => get<StatusReport>('/v1/status', signal),

  agents: (
    q: {capability?: string; rank?: string; minScore?: number; limit?: number} = {},
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
    return get<{agents: AgentSummary[]}>(`/v1/agents?${params}`, signal).then((r) => r.agents);
  },

  agent: (agentId: number, signal?: AbortSignal) => get<AgentSummary>(`/v1/agents/${agentId}`, signal),

  /** Who paid for an agent's record (v3). Public. */
  trust: (agentId: number, signal?: AbortSignal) => get<TrustReport>(`/v1/agents/${agentId}/trust`, signal),

  /** One job and its on-chain history. Public: the evidence for a run step. */
  job: (jobId: string, signal?: AbortSignal) =>
    get<JobEvents>(`/v1/jobs/${encodeURIComponent(jobId)}`, signal),

  run: (runId: string, signal?: AbortSignal) =>
    get<RunDetail>(`/v1/runs/${encodeURIComponent(runId)}`, signal),

  /**
   * The runs an orchestrator has made, newest first. Needs its key — a run
   * history is that agent's own business — which, as on the demo page, is
   * used for the request and never stored.
   */
  async runs(apiKey: string, limit = 50): Promise<RunSummary[]> {
    const body = await request<{runs: RunSummary[]}>(
      `/v1/runs?limit=${limit}`,
      {headers: {authorization: `Bearer ${apiKey}`}},
      'could not list runs',
    );
    return body.runs;
  },

  /**
   * `POST /v1/agents/challenge` (NEAR-PORT §5). Asked twice during
   * registration: first without `chainAgentId`, for `walletPublicKey` — the
   * key tx 1 adds to the agent's account, before anything is on chain — and
   * then by `register`, naming the id `register_agent` returned.
   */
  challenge(
    body: {ownerAddress: string; walletAddress: string; chainAgentId?: string; chainId: ChainId},
    signal?: AbortSignal,
  ): Promise<Challenge> {
    return request<Challenge>(
      '/v1/agents/challenge',
      {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
        ...(signal ? {signal} : {}),
      },
      'could not start the registration',
    );
  },

  /**
   * Create the Pactora record for an agent.
   *
   * The API key comes back exactly once and is never recoverable, so the page
   * must put it in front of the person before anything else can navigate away.
   *
   * The owner proves control first (audit 2026-10-26): the API issues a
   * single-use challenge for exactly these values, `sign` has the owner's
   * wallet sign it (NEP-413), and the registration carries the nonce, the
   * public key and the signature. The API checks the key is a full-access key
   * of the owner and that `chainAgentId` on chain is this owner's, for this
   * wallet.
   */
  async register(
    body: {
      name: string;
      description?: string;
      capabilities: string[];
      pricePerTask: string;
      walletAddress: string;
      ownerAddress: string;
      chainId: ChainId;
      /** The Pactora contract's agent id, from `register_agent`. Required: an agent not on chain cannot be hired. */
      chainAgentId: string;
    },
    sign: (challenge: {
      message: string;
      recipient: string;
      nonce: string;
    }) => Promise<{accountId: string; publicKey: string; signature: string}>,
  ): Promise<RegisteredAgent> {
    const challenge = await api.challenge({
      ownerAddress: body.ownerAddress,
      walletAddress: body.walletAddress,
      chainAgentId: body.chainAgentId,
      chainId: body.chainId,
    });
    const signed = await sign({
      message: challenge.message,
      recipient: challenge.recipient,
      nonce: challenge.nonce,
    });
    // A wallet can sign as whichever account is selected in it. Caught here,
    // where it can be said plainly, rather than as a 401 from the API.
    if (signed.accountId !== body.ownerAddress) {
      throw new Error(
        `The wallet signed as ${signed.accountId}, not the owner ${body.ownerAddress}. Switch accounts and try again.`,
      );
    }
    return request<RegisteredAgent>(
      '/v1/agents',
      {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          ...body,
          nonce: challenge.nonce,
          publicKey: signed.publicKey,
          signature: signed.signature,
        }),
      },
      'registration failed',
    );
  },

  /**
   * Start a run.
   *
   * The key is supplied by whoever is driving the demo and is never stored:
   * a browser is not a place to keep an agent's credentials, and a page that
   * remembered one would leave it in `localStorage` for the next person on
   * that machine.
   */
  async startRun(goal: string, apiKey: string): Promise<{runId: string; eventsUrl: string}> {
    return request<{runId: string; eventsUrl: string}>(
      '/v1/runs',
      {
        method: 'POST',
        headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
        body: JSON.stringify({goal}),
      },
      'could not start',
    );
  },
};

/**
 * Subscribe to a run's events.
 *
 * The server sends everything that already happened when a client connects,
 * so a page opened late, or refreshed mid-run, still shows the whole story.
 * Since v3 every event has an id and a reconnect resumes after the last one
 * seen, rather than replaying it all. Returns an unsubscribe function.
 */
export type StreamState = 'open' | 'reconnecting' | 'lost';

export function subscribeToRun(
  runId: string,
  onEvent: (event: RunEvent) => void,
  onClose?: () => void,
  /**
   * Connection state, so a dropped stream is said rather than looking like a
   * run that never ends: `reconnecting` after an error, `lost` after three in
   * a row (it keeps retrying; `open` again when it gets back).
   */
  onConnection?: (state: StreamState) => void,
  /**
   * A server without event ids (v2) replays a run's whole history on every
   * connection. Called when a RE-connection opens, before that replay, so the
   * page starts its trace over instead of showing every line twice. A v3
   * server sends ids and resumes after the last one seen, so this is never
   * called there — clearing the trace would throw its history away.
   */
  onReplay?: () => void,
): () => void {
  const url = `${API_URL}/v1/runs/${encodeURIComponent(runId)}/events`;

  // Every kind the page renders. A kind missing here is not an error — it is
  // silence: an SSE event with no listener is dropped by the browser.
  const KINDS: RunEventKind[] = [
    'planned',
    'plan-failed',
    'discovered',
    'excluded',
    'selected',
    'hired',
    'judged',
    'settled',
    'disputed',
    'retrying',
    'skipped',
    'finished',
    'failed',
  ];

  let source: EventSource;
  let ended = false; // a terminal event arrived: the run is over
  let stopped = false; // the page unsubscribed
  let failures = 0;
  let opened = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** The id of the last event seen ('' from a server that sends none). */
  let lastId = '';

  const connect = () => {
    // A NEW EventSource does not carry the old one's Last-Event-ID, so a
    // reconnect of our own says where it got to in the query instead.
    source = new EventSource(lastId ? `${url}?lastEventId=${encodeURIComponent(lastId)}` : url);
    for (const kind of KINDS) {
      source.addEventListener(kind, (e) => {
        const id = (e as MessageEvent).lastEventId;
        if (id) lastId = id;
        try {
          onEvent({kind, payload: JSON.parse((e as MessageEvent).data), at: Date.now()});
        } catch {
          // A malformed frame must not kill the stream; the run is still real
          // and the next event will render.
        }
        if ((kind === 'finished' || kind === 'failed') && !ended) {
          ended = true;
          source.close();
          onClose?.();
        }
      });
    }
    source.onopen = () => {
      failures = 0;
      opened += 1;
      // Only a server without ids replays everything on a reconnect.
      if (opened > 1 && !lastId) onReplay?.();
      onConnection?.('open');
    };
    source.onerror = () => {
      if (ended || stopped) return;
      failures += 1;
      onConnection?.(failures >= 3 ? 'lost' : 'reconnecting');
      // Only a terminal EVENT ends a run. A closed source is the browser giving
      // up — Firefox does on a reset connection where Chrome retries — and it
      // used to read as "finished". Retry ourselves, backing off to 15 s.
      if (source.readyState === EventSource.CLOSED) {
        retry = setTimeout(
          () => {
            if (!stopped && !ended) connect();
          },
          Math.min(3_000 * failures, 15_000),
        );
      }
    };
  };
  connect();

  return () => {
    stopped = true;
    clearTimeout(retry);
    source.close();
  };
}

/** `20000` → `0.02`, without floats: the string is the source of truth. */
export function formatUnits(base: string, decimals = 6): string {
  const negative = base.startsWith('-');
  const digits = (negative ? base.slice(1) : base).padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals) || '0';
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
