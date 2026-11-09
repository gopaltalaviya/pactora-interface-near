import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  amountDisplay,
  availableActions,
  bidStanding,
  eventWords,
  jobStateWords,
  jobTitle,
  jobTone,
  market,
  partyOf,
  receivesDisplay,
  windowDisplay,
  type Application,
  type JobDetail,
} from './market';

afterEach(() => vi.restoreAllMocks());

const CLIENT = '11';
const WORKER = '22';
type J = Pick<JobDetail, 'state' | 'chainJobId' | 'resultMismatch' | 'clientAgentId' | 'workerAgentId'>;
const job = (over: Partial<J> = {}): J => ({
  state: 'created',
  chainJobId: '5',
  resultMismatch: false,
  clientAgentId: CLIENT,
  workerAgentId: WORKER,
  ...over,
});

describe('formatting', () => {
  it('shows what the worker receives, from base units, with no float', () => {
    expect(receivesDisplay('4950000', 6, 'USDC')).toBe('4.95 USDC');
    expect(receivesDisplay('123456789012345678', 6, 'USDC')).toBe('123456789012.345678 USDC');
    expect(amountDisplay('20000', 6, 'USDC')).toBe('0.02 USDC');
    expect(amountDisplay('1000000', 6, '')).toBe('1');
  });

  it('shows windows in the unit a person thinks in', () => {
    expect(windowDisplay(18000)).toBe('5 h');
    expect(windowDisplay(600)).toBe('10 min');
    expect(windowDisplay(90)).toBe('90 s');
  });

  it('says a job’s state in plain words, and an unfunded job is not "offered"', () => {
    expect(jobStateWords({state: 'submitted', chainJobId: '5', declined: null}).plain).toMatch(
      /approve.*dispute/s,
    );
    expect(jobStateWords({state: 'created', chainJobId: null, declined: null}).label).toBe('Not funded yet');
    expect(jobStateWords({state: 'created', chainJobId: '5', declined: null}).label).toBe('Offered');
    expect(
      jobStateWords({state: 'created', chainJobId: '5', declined: {reason: 'too far', at: 'x'}}).plain,
    ).toMatch(/too far/);
    expect(jobStateWords({state: 'settled', chainJobId: '5', declined: null}).plain).toMatch(/paid/);
  });

  it('gives each state a tone, and every event a sentence (the raw kind only as a last resort)', () => {
    expect(jobTone('settled')).toBe('settled');
    expect(jobTone('disputed')).toBe('broken');
    expect(eventWords('job.accepted')).toBe('Accepted by the worker');
    expect(eventWords('something_new')).toBe('something_new');
  });
});

describe('who may do what to a job', () => {
  it('knows which side the signed-in person is on', () => {
    expect(partyOf(job(), CLIENT)).toBe('client');
    expect(partyOf(job(), WORKER)).toBe('worker');
    expect(partyOf(job(), '33')).toBeNull();
    expect(partyOf(job(), null)).toBeNull();
  });

  it('offers the worker accept or decline, then submit', () => {
    expect(availableActions(job({state: 'created'}), WORKER)).toEqual(['accept', 'decline']);
    expect(availableActions(job({state: 'accepted'}), WORKER)).toEqual(['submit']);
    expect(availableActions(job({state: 'submitted'}), WORKER)).toEqual([]);
    expect(availableActions(job({state: 'settled'}), WORKER)).toEqual([]);
  });

  it('offers the client funding while the job is not on chain, then cancel until it is accepted', () => {
    expect(availableActions(job({state: 'created', chainJobId: null}), CLIENT)).toEqual(['create']);
    expect(availableActions(job({state: 'created'}), CLIENT)).toEqual(['cancel']);
    expect(availableActions(job({state: 'accepted'}), CLIENT)).toEqual([]);
  });

  it('offers a delivery’s client approve and dispute, but never approve on a mismatched result', () => {
    expect(availableActions(job({state: 'submitted'}), CLIENT)).toEqual(['approve', 'dispute']);
    expect(availableActions(job({state: 'submitted', resultMismatch: true}), CLIENT)).toEqual(['dispute']);
  });

  it('offers a stranger, and a signed-out visitor, nothing; and a worker only a decline before the job is on chain', () => {
    expect(availableActions(job({state: 'submitted'}), '33')).toEqual([]);
    expect(availableActions(job({state: 'submitted'}), null)).toEqual([]);
    expect(availableActions(job({chainJobId: null}), WORKER)).toEqual(['decline']);
    expect(availableActions(job({chainJobId: null, state: 'accepted'}), WORKER)).toEqual([]);
  });

  it('says a refund after a ruling is the arbiter’s doing, not a cancellation (M15)', () => {
    const ruled = jobStateWords({
      state: 'refunded',
      chainJobId: '5',
      declined: null,
      events: [{kind: 'dispute_resolved', txHash: 'T', explorerUrl: null, occurredAt: 'x'}],
    });
    expect(ruled.label).toBe('Refunded after the dispute');
    expect(ruled.plain).toMatch(/arbiter ruled for the client/);
    expect(ruled.plain).not.toMatch(/Cancelled/);
    expect(jobStateWords({state: 'refunded', chainJobId: '5', declined: null}).plain).not.toMatch(
      /Cancelled/,
    );
    const expired = jobStateWords({
      state: 'settled',
      chainJobId: '5',
      declined: null,
      events: [{kind: 'dispute_expired', txHash: 'T', explorerUrl: null, occurredAt: 'x'}],
    });
    expect(expired.plain).toMatch(/half to the worker, half back to the client/);
  });

  it('titles a job by its listing, else its skill, else "Job"', () => {
    expect(jobTitle({spec: {capability: 'shop-photos'}, title: 'Photograph two shop fronts'})).toBe(
      'Photograph two shop fronts',
    );
    expect(jobTitle({spec: {capability: 'shop-photos'}, listingTitle: 'From the listing'})).toBe(
      'From the listing',
    );
    expect(jobTitle({spec: {capability: 'shop-photos'}})).toBe('shop-photos');
    expect(jobTitle({spec: null})).toBe('Job');
  });
});

const bid = (over: Partial<Application> = {}): Application => ({
  applicationId: 'a1',
  status: 'pending',
  priceBaseUnits: '1000000',
  priceDisplay: '1 USDC',
  feeBaseUnits: '10000',
  workerReceivesBaseUnits: '990000',
  proposal: 'x'.repeat(30),
  reason: null,
  reopenable: false,
  jobId: null,
  createdAt: '2026-11-08T10:00:00Z',
  decidedAt: null,
  ...over,
});

describe('bidStanding', () => {
  it('lets someone with no bids apply', () => {
    expect(bidStanding([])).toMatchObject({canApply: true, used: 0, blocked: null, live: null});
  });
  it('blocks a second bid while one is waiting, and says to withdraw it', () => {
    const s = bidStanding([bid()]);
    expect(s.canApply).toBe(false);
    expect(s.blocked).toMatch(/withdraw/i);
    expect(s.live?.applicationId).toBe('a1');
  });
  it('blocks after three bids, but not for bids the client set aside by closing the listing', () => {
    const spent = [
      bid({applicationId: 'a', status: 'withdrawn'}),
      bid({applicationId: 'b', status: 'rejected'}),
      bid({applicationId: 'c', status: 'withdrawn'}),
    ];
    const s = bidStanding(spent);
    expect(s.used).toBe(3);
    expect(s.canApply).toBe(false);
    expect(s.blocked).toMatch(/3 bids/);
    const aside = bidStanding([
      ...spent.slice(0, 2),
      bid({applicationId: 'd', status: 'pending', reopenable: true}),
    ]);
    // A set-aside bid is not counted, and is not "live" for the API either way.
    expect(aside.used).toBe(2);
  });
  it('points a selected bidder to their job', () => {
    const s = bidStanding([bid({status: 'selected', jobId: 'j1'})]);
    expect(s.canApply).toBe(false);
    expect(s.blocked).toMatch(/job/);
  });
});

describe('the requests', () => {
  function record() {
    const seen: {url: string; init: RequestInit}[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      seen.push({url: String(url), init: (init ?? {}) as RequestInit});
      return new Response(JSON.stringify({count: 0, nextCursor: null, listings: []}), {status: 200});
    });
    return seen;
  }

  it('sends the board’s filters as the query the API reads, and leaves out the empty ones', async () => {
    const seen = record();
    await market.listings(
      {category: 'physical', skill: 'rust', location: '', match: 'me', limit: 12, cursor: 'c1'},
      'ps_x',
    );
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe('/v1/listings');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: 'physical',
      skill: 'rust',
      match: 'me',
      limit: '12',
      cursor: 'c1',
    });
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer ps_x');
  });

  it('sends no bearer on the public board, and mine=true only when asked', async () => {
    const seen = record();
    await market.listings({mine: false});
    await market.listings({mine: true}, 'ps_x');
    expect(seen[0]!.init.headers).toBeUndefined();
    expect(new URL(seen[0]!.url).search).toBe('');
    expect(new URL(seen[1]!.url).searchParams.get('mine')).toBe('true');
  });

  it('posts a listing with its Idempotency-Key header', async () => {
    const seen = record();
    await market.createListing('ps_x', {title: 't'} as never, 'key-123');
    expect(seen[0]!.init.method).toBe('POST');
    expect((seen[0]!.init.headers as Record<string, string>)['idempotency-key']).toBe('key-123');
  });

  it('keeps the status and retryAfter of a 409, which is how "not final yet" is told from "reverted"', async () => {
    const answers = [
      new Response(JSON.stringify({code: 'INVALID_STATE', detail: 'not final', retryAfter: 2}), {
        status: 409,
      }),
      new Response(JSON.stringify({code: 'INVALID_STATE', detail: 'reverted'}), {status: 409}),
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => answers.shift()!);
    const first = await market.confirm('ps_x', 'j', 'approve', 'h').catch((e: unknown) => e);
    expect(first).toMatchObject({code: 'INVALID_STATE', status: 409, retryAfter: 2});
    const second = await market.confirm('ps_x', 'j', 'approve', 'h').catch((e: unknown) => e);
    expect(second).toMatchObject({status: 409, retryAfter: undefined});
  });
});
