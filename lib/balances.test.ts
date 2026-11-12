import {afterEach, describe, expect, it, vi} from 'vitest';
import type {NetworkInfo} from './api';
import {moneyLines, nearFaucetOf, NEAR_FAUCET, openJobsMoney, readWallet, type WalletMoney} from './balances';
import {viewAccount} from './chain';

/**
 * "Your money" (2026-11-12): each place money can be, read where it lives,
 * and said with its meaning and the next step when it is low or missing.
 */

afterEach(() => vi.unstubAllGlobals());

const network = {
  chainId: 'near:testnet',
  nearNetworkId: 'testnet',
  name: 'NEAR Testnet',
  testnet: true,
  paymentToken: {symbol: 'mUSDC', decimals: 6, accountId: 'musdc.testnet'},
  contracts: {Pactora: 'pactora.testnet', PaymentToken: 'musdc.testnet', Arbiter: 'arb.testnet'},
  rpcUrls: ['https://rpc.test'],
  nativeCurrency: {name: 'NEAR', symbol: 'NEAR', decimals: 24},
  explorerBaseUrl: null,
  faucetUrls: [],
  fastPathMaxDisplay: '5 mUSDC',
  protocolFeeBps: 100,
  minFee: '100',
  bondBps: 2000,
  minBond: '10000',
  disputeBondBps: 1000,
  minDisputeBond: '10000',
  minStake: '10000000',
} satisfies NetworkInfo;

/** A node that answers by request type and method, like the real one. */
function node(answers: {account?: unknown; accountError?: unknown; views?: Record<string, unknown>}) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const params = JSON.parse(String(init.body)).params;
    if (params.request_type === 'view_account') {
      if (answers.accountError) return Response.json({jsonrpc: '2.0', id: 'x', error: answers.accountError});
      return Response.json({jsonrpc: '2.0', id: 'x', result: answers.account});
    }
    const value = answers.views?.[params.method_name];
    if (value instanceof Error) return Response.json({jsonrpc: '2.0', id: 'x', error: {data: value.message}});
    return Response.json({
      jsonrpc: '2.0',
      id: 'x',
      result: {result: [...new TextEncoder().encode(JSON.stringify(value ?? null))]},
    });
  });
}

describe('viewAccount', () => {
  it('reads the NEAR balance, and an account not on chain as null, not a failure', async () => {
    vi.stubGlobal(
      'fetch',
      node({account: {amount: '2500000000000000000000000', locked: '0', storage_usage: 182}}),
    );
    expect(await viewAccount('https://rpc.test', 'ann.testnet')).toEqual({
      amount: '2500000000000000000000000',
      locked: '0',
      storage_usage: 182,
    });
    vi.stubGlobal(
      'fetch',
      node({
        accountError: {
          name: 'HANDLER_ERROR',
          cause: {name: 'UNKNOWN_ACCOUNT'},
          data: 'account ghost.testnet does not exist while viewing',
        },
      }),
    );
    expect(await viewAccount('https://rpc.test', 'ghost.testnet')).toBeNull();
  });

  it('says so when the node cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(viewAccount('https://rpc.test', 'ann.testnet')).rejects.toThrow(/Cannot reach the NEAR RPC/);
  });
});

describe('readWallet', () => {
  it('reads NEAR, the token balance and the token registration side by side', async () => {
    const fetch = node({
      account: {amount: '1000000000000000000000000', locked: '0', storage_usage: 1},
      views: {
        ft_balance_of: '7500000',
        storage_balance_of: {total: '1250000000000000000000', available: '0'},
      },
    });
    vi.stubGlobal('fetch', fetch);
    const w = await readWallet('https://rpc.test', 'ann.testnet', 'musdc.testnet');
    expect(w).toEqual({
      near: {ok: true, value: '1000000000000000000000000'},
      token: {ok: true, value: '7500000'},
      registered: {ok: true, value: true},
    });
    const asked = fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)).params);
    expect(asked.find((p) => p.method_name === 'ft_balance_of')).toMatchObject({account_id: 'musdc.testnet'});
  });

  it('keeps one failed read on its own line', async () => {
    vi.stubGlobal(
      'fetch',
      node({
        account: {amount: '1', locked: '0', storage_usage: 1},
        views: {ft_balance_of: new Error('no contract'), storage_balance_of: null},
      }),
    );
    const w = await readWallet('https://rpc.test', 'ann.testnet', 'musdc.testnet');
    expect(w.near).toEqual({ok: true, value: '1'});
    expect(w.token).toMatchObject({ok: false});
    expect(w.registered).toEqual({ok: true, value: false});
  });
});

describe('openJobsMoney', () => {
  it('sums escrow as a client and bonds as a worker; a job not on chain holds nothing', () => {
    const out = openJobsMoney(
      [
        {state: 'created', role: 'client', amount: '1000000', chainJobId: '1'},
        {state: 'created', role: 'client', amount: '9000000', chainJobId: null},
        {state: 'disputed', role: 'client', amount: '1000000', chainJobId: '2'},
        {state: 'accepted', role: 'worker', amount: '1000000', chainJobId: '3'},
        {state: 'created', role: 'worker', amount: '1000000', chainJobId: '4'},
      ],
      network,
    );
    // 1 + 1 + the dispute bond of 0.1 (10% of 1, above the 0.01 floor).
    expect(out.escrow).toBe('2100000');
    expect(out.escrowJobs).toBe(2);
    // 20% of 1: the bond is locked only once the worker accepts.
    expect(out.bonds).toBe('200000');
    expect(out.bondJobs).toBe(1);
  });
});

const wallet = (over: Partial<WalletMoney> = {}): WalletMoney => ({
  near: {ok: true, value: '1000000000000000000000000'},
  token: {ok: true, value: '5000000'},
  registered: {ok: true, value: true},
  ...over,
});
const record = {
  agent: {owner: 'ann.testnet', wallet: 'ann.testnet', pending_wallet: null, frozen: false},
  purse: {
    balance: '0',
    per_task_cap: '1000000',
    daily_cap: '2000000',
    spent_today: '2000000',
    daily_remaining: '0',
    next_release_at: 0,
  },
  stake: {available: '0', pending: '0', unlock_at: 0, locked: '0', unlocked: '0', hireable: false},
  storage: '90000000000000000000000',
};
const lines = (over: Partial<Parameters<typeof moneyLines>[0]> = {}) =>
  moneyLines({
    network,
    account: 'ann.testnet',
    chainAgentId: '177',
    wallet: wallet(),
    record: {ok: true, value: record},
    jobs: null,
    nowMs: Date.UTC(2026, 10, 12, 9),
    ...over,
  });
const line = (all: ReturnType<typeof moneyLines>, id: string) => all.find((l) => l.id === id)!;

describe('moneyLines', () => {
  it('says each line in words, and a low one with its fix', () => {
    const all = lines();
    expect(line(all, 'near')).toMatchObject({value: '1 NEAR', status: 'ok'});
    expect(line(all, 'token')).toMatchObject({value: '5 mUSDC', status: 'ok'});
    const purse = line(all, 'purse');
    expect(purse).toMatchObject({value: '0 mUSDC', status: 'low'});
    expect(purse.meaning).toMatch(/Pays for the jobs you hire/);
    expect(purse.next).toEqual({href: '/agents/177/manage#fund-card', label: 'Fund your purse'});
    expect(line(all, 'daily')).toMatchObject({value: '0 mUSDC of 2 mUSDC', status: 'low'});
    const stake = line(all, 'stake');
    expect(stake.status).toBe('low');
    expect(stake.advice).toBe('Below the minimum, nobody can hire you. Add at least 10 mUSDC.');
    expect(stake.next?.href).toBe('/agents/177/manage#stake-card');
    expect(line(all, 'storage')).toMatchObject({value: '0.09 NEAR', status: 'ok'});
  });

  it('says an account the token does not know, and offers the faucet on testnet', () => {
    const reg = line(lines({wallet: wallet({registered: {ok: true, value: false}})}), 'registered');
    expect(reg).toMatchObject({value: 'Not yet', status: 'missing'});
    expect(reg.advice).toMatch(/nobody can send you mUSDC/);
    expect(reg.next).toEqual({href: '/me#faucet', label: 'Get test mUSDC from the faucet'});
  });

  it('says an RPC failure on its own line, with what to do, and keeps the rest', () => {
    const all = lines({wallet: wallet({near: {ok: false, error: 'Cannot reach the NEAR RPC node.'}})});
    expect(line(all, 'near')).toMatchObject({value: 'Could not be read', status: 'error'});
    expect(line(all, 'near').advice).toMatch(/Refresh/);
    expect(line(all, 'token').status).toBe('ok');
    expect(line(lines({record: {ok: false, error: 'boom'}}), 'record').status).toBe('error');
  });

  it('says an account not on chain, and sends low NEAR to a faucet', () => {
    const missing = line(lines({wallet: wallet({near: {ok: true, value: null}})}), 'near');
    expect(missing.status).toBe('missing');
    expect(missing.next).toEqual({href: NEAR_FAUCET, label: 'NEAR testnet faucet'});
    const low = line(lines({wallet: wallet({near: {ok: true, value: '10000000000000000000000'}})}), 'near');
    expect(low).toMatchObject({value: '0.01 NEAR', status: 'low'});
  });

  it('sums the open jobs in words', () => {
    const all = lines({
      jobs: {ok: true, value: {escrow: '2000000', escrowJobs: 2, bonds: '0', bondJobs: 0, partial: false}},
    });
    expect(line(all, 'escrow')).toMatchObject({value: '2 mUSDC'});
    expect(line(all, 'escrow').meaning).toMatch(/^2 open jobs: paid to the worker/);
    expect(line(all, 'bonds').meaning).toBe('No accepted job holds a bond of yours.');
  });
});

describe('nearFaucetOf', () => {
  it('uses the API’s faucet, else the public one on testnet only, and never a non-https link', () => {
    expect(nearFaucetOf({faucetUrls: ['https://faucet.example/near'], testnet: true})).toBe(
      'https://faucet.example/near',
    );
    expect(nearFaucetOf({faucetUrls: [], testnet: true})).toBe('https://near-faucet.io/');
    expect(nearFaucetOf({faucetUrls: ['javascript:alert(1)'], testnet: true})).toBe(
      'https://near-faucet.io/',
    );
    expect(nearFaucetOf({faucetUrls: [], testnet: false})).toBeNull();
  });
});
