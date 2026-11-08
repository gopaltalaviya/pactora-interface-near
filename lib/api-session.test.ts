import {afterEach, describe, expect, it, vi} from 'vitest';
import {api, ApiError} from './api';

afterEach(() => vi.restoreAllMocks());

const challenge = {
  nonce: 'ab'.repeat(32),
  message: 'Pactora: sign in.',
  recipient: 'pactora',
  expiresAt: '2026-11-08T12:00:00Z',
};
const session = {
  token: 'ps_0123456789abcdef_' + 'x'.repeat(32),
  account: 'alice.testnet',
  chainId: 'near:testnet',
  expiresAt: '2026-11-15T12:00:00Z',
  person: null,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
const problem = (status: number, code: string, detail = 'no') => json({code, detail}, status);

type Seen = {path: string; method: string; headers: Record<string, string>; body: unknown};
function record(answer: (seen: Seen) => Response) {
  const seen: Seen[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const s: Seen = {
      path: new URL(String(url)).pathname,
      method: (init as RequestInit | undefined)?.method ?? 'GET',
      headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
      body: (init as RequestInit | undefined)?.body
        ? JSON.parse(String((init as RequestInit).body))
        : undefined,
    };
    seen.push(s);
    return answer(s);
  });
  return {seen, spy};
}

describe('signing in', () => {
  const signed = {accountId: 'alice.testnet', publicKey: 'ed25519:k', signature: 'c2ln'};

  it('asks for a challenge, has it signed, and posts the signature with that nonce', async () => {
    const {seen} = record((s) =>
      s.path === '/v1/session/challenge' ? json(challenge, 201) : json(session, 201),
    );
    const sign = vi.fn(async () => signed);
    const out = await api.createSession({accountId: 'alice.testnet'}, sign);
    expect(out.token).toBe(session.token);
    expect(sign).toHaveBeenCalledWith({
      message: challenge.message,
      recipient: 'pactora',
      nonce: challenge.nonce,
    });
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'POST /v1/session/challenge',
      'POST /v1/session',
    ]);
    expect(seen[1]!.body).toEqual({
      accountId: 'alice.testnet',
      nonce: challenge.nonce,
      publicKey: 'ed25519:k',
      signature: 'c2ln',
    });
  });

  it('refuses a wallet that signed as another account, before posting anything', async () => {
    const {seen} = record(() => json(challenge, 201));
    await expect(
      api.createSession({accountId: 'alice.testnet'}, async () => ({
        ...signed,
        accountId: 'mallory.testnet',
      })),
    ).rejects.toThrow(/signed as mallory.testnet, not alice.testnet/);
    expect(seen).toHaveLength(1);
  });

  it('passes the API problem through', async () => {
    record((s) => (s.path === '/v1/session/challenge' ? json(challenge, 201) : problem(401, 'UNAUTHORIZED')));
    await expect(api.createSession({accountId: 'alice.testnet'}, async () => signed)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('using a session', () => {
  it('sends the token as a bearer header, never in the URL', async () => {
    const {seen} = record(() =>
      json({account: 'alice.testnet', chainId: 'near:testnet', expiresAt: 'x', person: null}),
    );
    await api.getSession(session.token);
    expect(seen[0]!.headers['authorization']).toBe(`Bearer ${session.token}`);
    expect(seen[0]!.path).toBe('/v1/session');
  });

  it('signs out one session, or all of them, and a 204 is an answer', async () => {
    const {seen} = record(() => new Response(null, {status: 204}));
    await expect(api.deleteSession(session.token)).resolves.toBeUndefined();
    await expect(api.deleteAllSessions(session.token)).resolves.toBeUndefined();
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual(['DELETE /v1/session', 'DELETE /v1/sessions']);
  });

  it('reports a 401 as an ApiError with the API code', async () => {
    record(() => problem(401, 'UNAUTHORIZED'));
    const err = await api.getSession('ps_bad').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('UNAUTHORIZED');
  });

  it('records a person with the bearer token and the body as given', async () => {
    const {seen} = record(() =>
      json({publicId: 'p-1', chainAgentId: '17', name: 'Alice', kind: 'person'}, 201),
    );
    const out = await api.registerPerson(session.token, {chainAgentId: '17', name: 'Alice'});
    expect(out).toMatchObject({kind: 'person', chainAgentId: '17'});
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/v1/people',
      body: {chainAgentId: '17', name: 'Alice'},
    });
    expect(seen[0]!.headers['authorization']).toBe(`Bearer ${session.token}`);
  });

  it('surfaces INVALID_STATE (the chain does not show the agent yet)', async () => {
    record(() => problem(409, 'INVALID_STATE', 'wallet not accepted'));
    await expect(api.registerPerson(session.token, {chainAgentId: '17', name: 'A'})).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'wallet not accepted',
    });
  });
});
