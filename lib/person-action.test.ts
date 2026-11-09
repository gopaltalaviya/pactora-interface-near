import {describe, expect, it, vi} from 'vitest';
import {ApiError} from './api';
import type {ConfirmedAction, PreparedAction} from './market';
import {
  confirmPersonAction,
  PersonActionTimeout,
  runPersonAction,
  type PersonActionDeps,
} from './person-action';
import type {NearWallet} from './wallet';

const JOB = '9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e';
const HASH = 'H'.repeat(44);

const prepared = (over: Partial<PreparedAction> = {}): PreparedAction => ({
  jobId: JOB,
  action: 'approve',
  signerId: 'alice.testnet',
  functionCall: {
    receiverId: 'pactora.testnet',
    methodName: 'approve',
    args: {job_id: 5},
    gas: '100000000000000',
    deposit: '0',
  },
  expectedEvent: 'job_settled',
  ...over,
});
const confirmed: ConfirmedAction = {
  jobId: JOB,
  action: 'approve',
  txHash: HASH,
  state: 'settled',
  chainJobId: '5',
  resultMismatch: false,
  explorerUrl: `https://testnet.nearblocks.io/txns/${HASH}`,
  replayed: false,
};
const notFinal = () => new ApiError('INVALID_STATE', 'not final yet', 409, 2);

/** Fakes with a clock that only `sleep` moves, so a 60 s wait costs no time. */
function setup(
  opts: {
    prepare?: PreparedAction;
    confirm?: (n: number) => ConfirmedAction | Error;
    outcome?: unknown;
    account?: string;
  } = {},
) {
  let clock = 0;
  const events: string[] = [];
  const signAndSendTransactions = vi.fn(async (_p: unknown) => {
    events.push('sign');
    return [opts.outcome ?? {status: {SuccessValue: ''}, transaction: {hash: HASH}}];
  });
  const wallet = {signAndSendTransactions} as unknown as NearWallet;
  const prepare = vi.fn(async (..._a: unknown[]) => {
    events.push('prepare');
    return opts.prepare ?? prepared();
  });
  let n = 0;
  const confirm = vi.fn(async (..._a: unknown[]) => {
    events.push('confirm');
    const out = (opts.confirm ?? (() => confirmed))(++n);
    if (out instanceof Error) throw out;
    return out;
  });
  const ensureWallet = vi.fn(async () => wallet);
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const statuses: string[] = [];
  const deps: PersonActionDeps = {
    account: opts.account ?? 'alice.testnet',
    authed: async (run) => run('ps_token'),
    ensureWallet,
    contracts: async () => ({
      Pactora: 'pactora.testnet',
      PaymentToken: 'musdc.pactora.testnet',
      Arbiter: 'arbiter.pactora.testnet',
    }),
    api: {prepare, confirm},
    sleep,
    now: () => clock,
    onStatus: (s) => statuses.push(s),
  };
  return {deps, events, signAndSendTransactions, prepare, confirm, ensureWallet, sleep, statuses};
}

describe('runPersonAction', () => {
  it('prepares, signs exactly what was prepared, then confirms the hash the wallet returned', async () => {
    const t = setup();
    const out = await runPersonAction(t.deps, JOB, 'approve');
    expect(out).toEqual(confirmed);
    expect(t.events).toEqual(['prepare', 'sign', 'confirm']);
    expect(t.prepare).toHaveBeenCalledWith('ps_token', JOB, 'approve', {});
    expect(t.confirm).toHaveBeenCalledWith('ps_token', JOB, 'approve', HASH);
    const sent = t.signAndSendTransactions.mock.calls[0]![0] as {
      signerId: string;
      transactions: unknown[];
    };
    expect(sent.signerId).toBe('alice.testnet');
    expect(sent.transactions).toEqual([
      {
        receiverId: 'pactora.testnet',
        actions: [
          {
            type: 'FunctionCall',
            params: {methodName: 'approve', args: {job_id: 5}, gas: '100000000000000', deposit: '0'},
          },
        ],
      },
    ]);
  });

  it('passes a delivery or a dispute reason to prepare', async () => {
    const t = setup({
      prepare: prepared({
        action: 'submit',
        functionCall: {
          ...prepared().functionCall,
          methodName: 'submit_result',
          args: {job_id: 5, result_hash: 'ab'},
        },
      }),
    });
    const extra = {output: {answer: 42}, producedAt: '2026-11-08T10:00:00.000Z'};
    await runPersonAction(t.deps, JOB, 'submit', extra);
    expect(t.prepare).toHaveBeenCalledWith('ps_token', JOB, 'submit', extra);
  });

  it('refuses a signer that is not the signed-in account, before the wallet is asked', async () => {
    const t = setup({prepare: prepared({signerId: 'bob.testnet'})});
    await expect(runPersonAction(t.deps, JOB, 'approve')).rejects.toThrow(/bob\.testnet.*alice\.testnet/s);
    expect(t.ensureWallet).not.toHaveBeenCalled();
    expect(t.signAndSendTransactions).not.toHaveBeenCalled();
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it('refuses a prepared call that is not the expected method on a Pactora contract, before the wallet is asked (H1)', async () => {
    // A compromised or buggy API answers `prepare` with a token transfer to an outsider.
    const hostile = prepared({
      functionCall: {
        receiverId: 'musdc.pactora.testnet',
        methodName: 'ft_transfer',
        args: {receiver_id: 'attacker.testnet', amount: '4000000'},
        gas: '100000000000000',
        deposit: '1',
      },
    });
    const t = setup({prepare: hostile});
    await expect(
      runPersonAction(t.deps, JOB, 'approve', {}, {chainJobId: '5', amount: '4000000'}),
    ).rejects.toThrow(/asked the wallet to sign something unexpected.*refused/is);
    expect(t.ensureWallet).not.toHaveBeenCalled();
    expect(t.signAndSendTransactions).not.toHaveBeenCalled();
    expect(t.confirm).not.toHaveBeenCalled();

    // The right method on the right contract, but for another job.
    const otherJob = setup({
      prepare: prepared({functionCall: {...prepared().functionCall, args: {job_id: 6}}}),
    });
    await expect(runPersonAction(otherJob.deps, JOB, 'approve', {}, {chainJobId: '5'})).rejects.toThrow(
      /unexpected/i,
    );
    expect(otherJob.signAndSendTransactions).not.toHaveBeenCalled();

    // A deposit that is not 0 or 1 yocto on an approve.
    const deposit = setup({
      prepare: prepared({functionCall: {...prepared().functionCall, deposit: '1000000000000000000000000'}}),
    });
    await expect(runPersonAction(deposit.deps, JOB, 'approve', {}, {chainJobId: '5'})).rejects.toThrow(
      /unexpected/i,
    );
    expect(deposit.signAndSendTransactions).not.toHaveBeenCalled();

    // The expected call still goes through, with the job's chain id checked.
    const fine = setup();
    await expect(runPersonAction(fine.deps, JOB, 'approve', {}, {chainJobId: '5'})).resolves.toEqual(
      confirmed,
    );
    expect(fine.signAndSendTransactions).toHaveBeenCalledTimes(1);
  });

  it('polls while the API says it is not final, waits what it asks, and signs only once', async () => {
    const t = setup({confirm: (n) => (n < 3 ? notFinal() : confirmed)});
    const out = await runPersonAction(t.deps, JOB, 'approve');
    expect(out.state).toBe('settled');
    expect(t.confirm).toHaveBeenCalledTimes(3);
    expect(t.sleep.mock.calls.map((c) => c[0])).toEqual([2000, 2000]);
    expect(t.signAndSendTransactions).toHaveBeenCalledTimes(1);
    expect(t.prepare).toHaveBeenCalledTimes(1);
  });

  it('gives up after about a minute, says the transaction was sent, and keeps its hash for a re-check', async () => {
    const t = setup({confirm: () => notFinal()});
    const err = await runPersonAction(t.deps, JOB, 'approve').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PersonActionTimeout);
    expect((err as PersonActionTimeout).txHash).toBe(HASH);
    expect((err as Error).message).toMatch(/already sent/i);
    const waited = t.sleep.mock.calls.reduce((sum, c) => sum + (c[0] as number), 0);
    expect(waited).toBeGreaterThanOrEqual(58_000);
    expect(waited).toBeLessThanOrEqual(62_000);
    expect(t.signAndSendTransactions).toHaveBeenCalledTimes(1);

    // The re-check asks the API again about the same hash: no prepare, no wallet.
    const again = setup({confirm: () => confirmed});
    const out = await confirmPersonAction(again.deps, JOB, 'approve', HASH);
    expect(out).toEqual(confirmed);
    expect(again.prepare).not.toHaveBeenCalled();
    expect(again.ensureWallet).not.toHaveBeenCalled();
    expect(again.confirm).toHaveBeenCalledWith('ps_token', JOB, 'approve', HASH);
  });

  it('keeps the hash for a re-check, never a re-sign, when the API cannot record a sent transaction (5xx, network)', async () => {
    for (const failure of [
      // As lib/api.ts throws them: a 5xx and an unreachable API carry no status.
      new ApiError('INTERNAL', 'The API had a problem (500). Try again in a moment.'),
      new ApiError('UNREACHABLE', 'The API is unreachable.'),
      new TypeError('Failed to fetch'),
    ]) {
      const t = setup({confirm: () => failure});
      const err = await runPersonAction(t.deps, JOB, 'approve').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PersonActionTimeout);
      expect((err as PersonActionTimeout).txHash).toBe(HASH);
      expect((err as Error).message).toMatch(/sent.*do not sign again/i);
      expect(t.signAndSendTransactions).toHaveBeenCalledTimes(1);
    }
  });

  it('does not poll a refusal that is final (reverted, wrong party)', async () => {
    const reverted = setup({confirm: () => new ApiError('INVALID_STATE', 'the transaction reverted', 409)});
    await expect(runPersonAction(reverted.deps, JOB, 'approve')).rejects.toThrow(/reverted/);
    expect(reverted.confirm).toHaveBeenCalledTimes(1);
    expect(reverted.sleep).not.toHaveBeenCalled();

    const forbidden = setup({confirm: () => new ApiError('FORBIDDEN', 'not a party', 403)});
    await expect(runPersonAction(forbidden.deps, JOB, 'approve')).rejects.toThrow(/not a party/);
    expect(forbidden.confirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm when the wallet reports a failed transaction', async () => {
    const t = setup({outcome: {status: {Failure: {ActionError: 'refused'}}}});
    await expect(runPersonAction(t.deps, JOB, 'approve')).rejects.toThrow(/failed/);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm, and says so, when the wallet returns no transaction hash', async () => {
    const t = setup({outcome: {status: {SuccessValue: ''}}});
    await expect(runPersonAction(t.deps, JOB, 'approve')).rejects.toThrow(/transaction hash/);
    expect(t.confirm).not.toHaveBeenCalled();
  });

  it('says what it is doing at each step', async () => {
    const t = setup({confirm: (n) => (n < 2 ? notFinal() : confirmed)});
    await runPersonAction(t.deps, JOB, 'approve');
    expect(t.statuses).toEqual([
      'Checking the action with Pactora…',
      'Waiting for your wallet to sign…',
      'Sent. Waiting for the chain to confirm…',
      'Sent. Waiting for the chain to confirm… (2 s so far)',
      'Done.',
    ]);
  });
});
