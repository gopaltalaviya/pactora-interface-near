import {afterEach, describe, expect, it, vi} from 'vitest';
import {ChainReadError, readAgent, viewCall} from './chain';

afterEach(() => vi.restoreAllMocks());

const bytes = (value: unknown) => Array.from(new TextEncoder().encode(JSON.stringify(value)));
const rpc = (result: unknown) =>
  new Response(JSON.stringify({jsonrpc: '2.0', id: 'pactora', result: {result: bytes(result)}}));

describe('viewCall', () => {
  it('posts a call_function query with base64 args, and parses the returned bytes', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(rpc({balance: '123456789012345678901234567890'}));
    const out = await viewCall<{balance: string}>('https://rpc.test', 'pactora.testnet', 'purse_of', {
      agent_id: 7,
    });
    // A u128 stays the string it arrived as.
    expect(out.balance).toBe('123456789012345678901234567890');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://rpc.test');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.method).toBe('query');
    expect(body.params).toMatchObject({
      request_type: 'call_function',
      account_id: 'pactora.testnet',
      method_name: 'purse_of',
    });
    expect(atob(body.params.args_base64)).toBe('{"agent_id":7}');
  });

  it('returns null when the contract returns None', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(rpc(null));
    await expect(viewCall('https://rpc.test', 'p', 'get_agent', {agent_id: 1})).resolves.toBeNull();
  });

  it('says so when the node is unreachable, or the chain refuses the call', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(viewCall('https://rpc.test', 'p', 'm')).rejects.toThrow(/Cannot reach the NEAR RPC/);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({result: {error: 'wasm execution failed'}})),
    );
    await expect(viewCall('https://rpc.test', 'p', 'm')).rejects.toBeInstanceOf(ChainReadError);
  });
});

describe('readAgent', () => {
  it('reads the agent, purse, stake and storage in one go', async () => {
    const answers: Record<string, unknown> = {
      get_agent: {owner: 'alice.testnet', wallet: 'alice.testnet', pending_wallet: null, frozen: false},
      purse_of: {balance: '5'},
      stake_of: {available: '9', hireable: true},
      storage_balance_of: '1000',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = JSON.parse(String((init as RequestInit).body)).params.method_name as string;
      return rpc(answers[method]);
    });
    const r = await readAgent('https://rpc.test', 'pactora.testnet', '7');
    expect(r.agent?.owner).toBe('alice.testnet');
    expect(r.purse).toEqual({balance: '5'});
    expect(r.stake).toMatchObject({hireable: true});
    expect(r.storage).toBe('1000');
  });
});
