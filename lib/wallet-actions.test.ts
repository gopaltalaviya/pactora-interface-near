import {describe, expect, it, vi} from 'vitest';
import {
  acceptWalletTransaction,
  cancelUnstakeTransaction,
  completeUnstakeTransaction,
  fundTransaction,
  ftTransferCall,
  functionCall,
  ONE_YOCTO,
  registerPersonOnChain,
  registerPersonTransaction,
  requestUnstakeTransaction,
  sendTransaction,
  setCapsTransaction,
  stakeTransaction,
  storageDepositTransaction,
  TESTNET_DEFAULTS,
  withdrawTransaction,
  type NearWallet,
} from './wallet';

const PACTORA = 'pactora.testnet';
const CARD = 'data:application/json;base64,e30=';
const ok = (value: string) => ({status: {SuccessValue: btoa(value)}});

function fakeWallet(outcomes: unknown[]) {
  const signAndSendTransactions = vi.fn(async () => outcomes);
  return {signAndSendTransactions} as unknown as NearWallet & {
    signAndSendTransactions: typeof signAndSendTransactions;
  };
}

type Call = {actions: {params: {methodName: string; args: Record<string, unknown>; deposit: string}}[]};
const first = (tx: unknown) => (tx as Call).actions[0]!.params;

describe('functionCall', () => {
  it('builds a FunctionCall with the default gas and no deposit', () => {
    expect(functionCall('accept_wallet', {agent_id: 3})).toEqual({
      type: 'FunctionCall',
      params: {methodName: 'accept_wallet', args: {agent_id: 3}, gas: '100000000000000', deposit: '0'},
    });
  });

  it('takes gas and deposit, and refuses anything that is not a plain integer string', () => {
    expect(functionCall('x', {}, {gas: '150000000000000', deposit: ONE_YOCTO})).toMatchObject({
      params: {gas: '150000000000000', deposit: '1'},
    });
    expect(() => functionCall('x', {}, {deposit: '1.5'})).toThrow(/yoctoNEAR/);
    expect(() => functionCall('x', {}, {deposit: '-1'})).toThrow(/yoctoNEAR/);
    expect(() => functionCall('x', {}, {gas: '0'})).toThrow(/gas/);
  });

  it('has the one yocto as a string', () => {
    expect(ONE_YOCTO).toBe('1');
  });
});

describe('ftTransferCall', () => {
  it('sends to the token with one yocto, and msg as the JSON text of the message', () => {
    const tx = ftTransferCall('musdc.testnet', PACTORA, '1500000', {Fund: {agent_id: 7}});
    expect(tx.receiverId).toBe('musdc.testnet');
    expect(tx.actions).toEqual([
      {
        type: 'FunctionCall',
        params: {
          methodName: 'ft_transfer_call',
          args: {receiver_id: PACTORA, amount: '1500000', msg: '{"Fund":{"agent_id":7}}'},
          gas: '150000000000000',
          deposit: '1',
        },
      },
    ]);
  });

  it('refuses a zero, negative or fractional amount and a bad account, before any wallet is asked', () => {
    for (const amount of ['0', '-5', '1.5', '', '1e6']) {
      expect(() => ftTransferCall('musdc.testnet', PACTORA, amount, {})).toThrow(/amount/);
    }
    expect(() => ftTransferCall('NOT VALID', PACTORA, '1', {})).toThrow(/token/);
    expect(() => ftTransferCall('musdc.testnet', 'Bad Receiver', '1', {})).toThrow(/receiver/);
  });
});

describe('sendTransaction', () => {
  it('returns the hash, and throws the chain reason on a failed outcome', async () => {
    const tx = acceptWalletTransaction(PACTORA, '3');
    const good = fakeWallet([{...ok('1'), transaction: {hash: 'H1'}}]);
    await expect(sendTransaction(good, 'alice.testnet', tx)).resolves.toMatchObject({txHash: 'H1'});
    const bad = fakeWallet([{status: {Failure: {ActionError: 'nope'}}}]);
    await expect(sendTransaction(bad, 'alice.testnet', tx, 'accept_wallet')).rejects.toThrow(
      /accept_wallet failed.*nope/,
    );
  });
});

describe('a person registering on chain', () => {
  it('register_agent has the account as its own wallet, null caps and the storage deposit', () => {
    const tx = registerPersonTransaction({pactora: PACTORA, wallet: 'alice.testnet', cardUri: CARD});
    expect(tx.receiverId).toBe(PACTORA);
    expect(first(tx)).toMatchObject({
      methodName: 'register_agent',
      args: {wallet: 'alice.testnet', card_uri: CARD, per_task_cap: null, daily_cap: null},
      deposit: TESTNET_DEFAULTS.storageDeposit,
    });
  });

  it('accept_wallet sends the id as a JSON number (a u64), with no deposit', () => {
    expect(first(acceptWalletTransaction(PACTORA, '17'))).toMatchObject({
      methodName: 'accept_wallet',
      args: {agent_id: 17},
      deposit: '0',
    });
    expect(() => acceptWalletTransaction(PACTORA, '18446744073709551615')).toThrow(/too large/);
    expect(() => acceptWalletTransaction(PACTORA, 'abc')).toThrow(/not an agent id/);
  });

  it('sends two sequential calls, and accept_wallet uses the id the first one returned', async () => {
    const calls: unknown[] = [];
    const outcomes = [
      {...ok('17'), transaction: {hash: 'A'}},
      {...ok(''), transaction: {hash: 'B'}},
    ];
    const wallet = {
      signAndSendTransactions: vi.fn(async (p: unknown) => {
        calls.push(p);
        return [outcomes[calls.length - 1]];
      }),
    } as unknown as NearWallet;
    const stages: string[] = [];
    const r = await registerPersonOnChain(
      wallet,
      {account: 'alice.testnet', pactora: PACTORA, cardUri: CARD},
      (stage, id) => stages.push(`${stage}:${id ?? ''}`),
    );
    expect(r).toEqual({chainAgentId: '17', txHashes: ['A', 'B']});
    expect(stages).toEqual(['register:', 'accept:17']);
    expect(calls).toHaveLength(2);
    expect((calls[0] as {transactions: unknown[]}).transactions).toHaveLength(1);
    expect(JSON.stringify(calls[1])).toContain('"agent_id":17');
  });

  it('resumes: with an id from an earlier attempt it sends only accept_wallet', async () => {
    const wallet = fakeWallet([ok('')]);
    const r = await registerPersonOnChain(wallet, {
      account: 'alice.testnet',
      pactora: PACTORA,
      cardUri: CARD,
      resume: '17',
    });
    expect(r.chainAgentId).toBe('17');
    expect(wallet.signAndSendTransactions).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(wallet.signAndSendTransactions.mock.calls[0])).toContain('accept_wallet');
  });

  it('does not send accept_wallet when register_agent failed', async () => {
    const wallet = fakeWallet([{status: {Failure: 'InsufficientStorage'}}]);
    await expect(
      registerPersonOnChain(wallet, {account: 'alice.testnet', pactora: PACTORA, cardUri: CARD}),
    ).rejects.toThrow(/register_agent failed/);
    expect(wallet.signAndSendTransactions).toHaveBeenCalledTimes(1);
  });
});

describe('the owner actions', () => {
  it('fund and stake are ft_transfer_call on the token with the contract message', () => {
    const fund = fundTransaction('musdc.testnet', PACTORA, '7', '2000000');
    expect(fund.receiverId).toBe('musdc.testnet');
    expect(first(fund).args).toMatchObject({msg: '{"Fund":{"agent_id":7}}', amount: '2000000'});
    expect(first(stakeTransaction('musdc.testnet', PACTORA, '7', '10000000')).args).toMatchObject({
      msg: '{"Stake":{"agent_id":7}}',
    });
  });

  it('set_caps, unstake and withdraw attach one yocto and pass amounts as strings', () => {
    expect(first(setCapsTransaction(PACTORA, '7', '100000', '1000000'))).toMatchObject({
      methodName: 'set_caps',
      args: {agent_id: 7, per_task_cap: '100000', daily_cap: '1000000'},
      deposit: '1',
    });
    expect(first(requestUnstakeTransaction(PACTORA, '7', '5'))).toMatchObject({
      methodName: 'request_unstake',
      args: {agent_id: 7, amount: '5'},
      deposit: '1',
    });
    expect(first(cancelUnstakeTransaction(PACTORA, '7'))).toMatchObject({
      methodName: 'cancel_unstake',
      deposit: '1',
    });
    expect(first(completeUnstakeTransaction(PACTORA, '7'))).toMatchObject({
      methodName: 'complete_unstake',
      deposit: '1',
    });
    expect(first(withdrawTransaction(PACTORA, '7', '9'))).toMatchObject({
      methodName: 'withdraw',
      args: {agent_id: 7, amount: '9', receiver: null},
      deposit: '1',
    });
    expect(first(withdrawTransaction(PACTORA, '7', '9', 'bob.testnet')).args).toMatchObject({
      receiver: 'bob.testnet',
    });
  });

  it('refuses caps the contract would refuse (per-task above daily), and a bad amount', () => {
    expect(() => setCapsTransaction(PACTORA, '7', '2', '1')).toThrow(/per-task cap/);
    expect(() => requestUnstakeTransaction(PACTORA, '7', '1.5')).toThrow(/whole number/);
    expect(() => withdrawTransaction(PACTORA, '7', '1', 'Not An Account')).toThrow(/account id/);
  });

  it('storage_deposit attaches the NEAR given, not one yocto', () => {
    const tx = storageDepositTransaction(PACTORA, '7', '100000000000000000000000');
    expect(first(tx)).toMatchObject({methodName: 'storage_deposit', deposit: '100000000000000000000000'});
    expect(() => storageDepositTransaction(PACTORA, '7', '0')).toThrow(/positive/);
  });
});
