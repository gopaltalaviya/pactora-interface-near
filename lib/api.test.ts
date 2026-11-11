import {afterEach, describe, expect, it, vi} from 'vitest';
import {api, ApiError, formatUnits} from './api';

/**
 * `formatUnits` turns base units into something a person reads, and it is the
 * only place in this repo that touches money.
 *
 * It had no tests. That is the wrong shape for a function whose failure mode
 * is a number on screen that is wrong by a factor of a million — during a
 * demo whose entire claim is that the payments are real.
 *
 * The rule it must never break: **the string is the source of truth.** A
 * uint128 amount exceeds 2^53, so anything that routes through a JS number
 * loses precision silently, and the first symptom is a total that does not
 * reconcile with the chain.
 */

describe('formatUnits', () => {
  it('converts USDC base units to a readable amount', () => {
    expect(formatUnits('20000')).toBe('0.02');
    expect(formatUnits('1000000')).toBe('1');
    expect(formatUnits('1500000')).toBe('1.5');
  });

  it('keeps a leading zero rather than emitting a bare dot', () => {
    expect(formatUnits('1')).toBe('0.000001');
    expect(formatUnits('10')).toBe('0.00001');
  });

  it('renders zero as zero', () => {
    expect(formatUnits('0')).toBe('0');
  });

  it('strips trailing zeros without stripping the value', () => {
    expect(formatUnits('100000')).toBe('0.1');
    expect(formatUnits('10000000')).toBe('10');
  });

  /**
   * The one that matters. 2^53 is about 9e15; a uint128 amount is far larger,
   * so an implementation that parsed to a Number would round here and be
   * quietly wrong about a payment.
   */
  it('is exact beyond the range a JS number can represent', () => {
    expect(formatUnits('123456789012345678901234567890')).toBe('123456789012345678901234.56789');
    expect(formatUnits('9007199254740993')).toBe('9007199254.740993');
  });

  it('handles a different decimal count', () => {
    expect(formatUnits('1000000000000000000', 18)).toBe('1');
    expect(formatUnits('1', 18)).toBe('0.000000000000000001');
  });

  it('keeps the sign on a negative amount', () => {
    expect(formatUnits('-20000')).toBe('-0.02');
  });
});

describe('how a failed request reads', () => {
  const answer = (status: number, body: unknown) =>
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/problem+json'}}),
      );
  afterEach(() => vi.restoreAllMocks());
  const failure = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error('expected the request to fail');
      },
      (e: unknown) => e as ApiError,
    );

  it('a 500 says the API had a problem — never a bare "/v1/agents?… failed (500)"', async () => {
    answer(500, {type: 'x', title: 'Internal error', status: 500, code: 'INTERNAL', traceId: 't'});
    const err = await failure(api.agents({limit: 5}));
    expect(err.message).toMatch(/The API had a problem \(500\)/);
    expect(err.message).not.toMatch(/\/v1\//);
    expect(err.code).toBe('INTERNAL');
  });

  it('a dependency outage (503) says so in words, and promises nothing it cannot know', async () => {
    answer(503, {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      detail: 'a service this request needs is unavailable',
    });
    const err = await failure(api.agents({limit: 5}));
    expect(err.message).toMatch(/temporarily unavailable/i);
    expect(err.message).toMatch(/try again/i);
    // Shared with writes: after a failed POST the site cannot know nothing was spent.
    expect(err.message).not.toMatch(/nothing was spent/i);
  });

  it('a 4xx keeps the API’s own explanation', async () => {
    answer(422, {status: 422, code: 'SCHEMA_MISMATCH', detail: 'limit: Number must be at most 100'});
    const err = await failure(api.agents({limit: 5}));
    expect(err.message).toBe('limit: Number must be at most 100');
  });
});

/**
 * Audit M1 (2026-10-26): registration used to need only public chain data, so
 * anyone watching the registry could register an agent first and take its
 * only API key. The owner now signs a single-use challenge from the API, as a
 * NEP-413 message (NEAR-WIRE §5).
 */
describe('registering an agent', () => {
  afterEach(() => vi.restoreAllMocks());
  const body = {
    name: 'Probe',
    capabilities: ['research'],
    pricePerTask: '20000',
    walletAddress: 'probe.alice.testnet',
    ownerAddress: 'alice.testnet',
    chainId: 'near:testnet',
    chainAgentId: '42',
  };
  const challenge = {
    nonce: 'ab'.repeat(32),
    message: 'Pactora: sign me',
    recipient: 'pactora',
    expiresAt: 'x',
  };

  // NEAR-WIRE §5 step 1: the key exists before the account, the id only after register_agent.
  it('asks for the signer key of the new wallet first, before anything is on chain', async () => {
    const calls: {url: string; body: Record<string, unknown>}[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({url: String(url), body: JSON.parse(String(init?.body))});
      return new Response(
        JSON.stringify({walletPublicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp'}),
      );
    });
    const key = await api.walletKey({walletAddress: body.walletAddress, chainId: body.chainId});
    expect(key).toBe('ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/v1\/agents\/wallet-key$/);
    expect(calls[0]!.body).toEqual({walletAddress: 'probe.alice.testnet', chainId: 'near:testnet'});
  });

  it('refuses a wallet-key answer that is not an ed25519 key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({walletPublicKey: 'nope'})));
    await expect(api.walletKey({walletAddress: body.walletAddress, chainId: body.chainId})).rejects.toThrow(
      /ed25519/,
    );
  });

  it('gets a challenge naming the agent id, has the owner sign it (NEP-413), and sends the proof', async () => {
    const calls: {url: string; body: Record<string, unknown>}[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({url: String(url), body: JSON.parse(String(init?.body))});
      return String(url).endsWith('/v1/agents/challenge')
        ? new Response(JSON.stringify(challenge))
        : new Response(
            JSON.stringify({
              agentId: 7,
              chainId: 'near:testnet',
              walletAddress: body.walletAddress,
              apiKey: 'ax_k',
            }),
            {status: 201},
          );
    });
    const sign = vi.fn(async () => ({
      accountId: 'alice.testnet',
      publicKey: 'ed25519:owner',
      signature: 'c2lnbmF0dXJl',
    }));

    const agent = await api.register(body, sign);

    expect(calls[0]!.body).toEqual({
      ownerAddress: 'alice.testnet',
      walletAddress: 'probe.alice.testnet',
      chainAgentId: '42',
      chainId: 'near:testnet',
    });
    expect(sign).toHaveBeenCalledWith({
      message: 'Pactora: sign me',
      recipient: 'pactora',
      nonce: 'ab'.repeat(32),
    });
    expect(calls[1]!.url).toMatch(/\/v1\/agents$/);
    expect(calls[1]!.body).toEqual({
      ...body,
      nonce: 'ab'.repeat(32),
      publicKey: 'ed25519:owner',
      signature: 'c2lnbmF0dXJl',
    });
    expect(agent.apiKey).toBe('ax_k');
  });

  it('refuses a signature from an account other than the owner, before sending it', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(challenge)));
    await expect(
      api.register(body, async () => ({
        accountId: 'mallory.testnet',
        publicKey: 'ed25519:x',
        signature: 's',
      })),
    ).rejects.toThrow(/mallory\.testnet/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('registers nothing when the owner declines to sign', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(challenge)));
    await expect(
      api.register(body, async () => {
        throw new Error('User rejected the request.');
      }),
    ).rejects.toThrow(/rejected/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
