import {describe, expect, it, vi} from 'vitest';
import {
  agentIdFromOutcome,
  nonceBytes,
  registerOnChain,
  registrationTransactions,
  signChallenge,
  TESTNET_DEFAULTS,
  type NearWallet,
} from './wallet';

const PACTORA = 'pactora.testnet';
const KEY = 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp';

const base64 = (s: string) => btoa(s);
const ok = (value: string) => ({status: {SuccessValue: base64(value)}});

function fakeWallet(outcomes: unknown[] = [ok(''), ok('17')]) {
  const signAndSendTransactions = vi.fn(async () => outcomes);
  const signMessage = vi.fn(async () => ({
    accountId: 'alice.testnet',
    publicKey: 'ed25519:owner',
    signature: 'c2ln',
  }));
  return {signAndSendTransactions, signMessage} as unknown as NearWallet & {
    signAndSendTransactions: typeof signAndSendTransactions;
    signMessage: typeof signMessage;
  };
}

const args = {
  owner: 'alice.testnet',
  wallet: 'probe.alice.testnet',
  pactora: PACTORA,
  walletPublicKey: KEY,
  cardUri: 'data:application/json;base64,e30=',
};

describe('the testnet defaults', () => {
  it('are the amounts the registration was sized for, in yoctoNEAR', () => {
    expect(TESTNET_DEFAULTS).toEqual({
      storageDeposit: '100000000000000000000000',
      agentFunding: '500000000000000000000000',
      keyAllowance: '250000000000000000000000',
    });
  });
});

describe('registrationTransactions (NEAR-WIRE §5)', () => {
  const [create, register] = registrationTransactions({...args, amounts: TESTNET_DEFAULTS});

  it('tx 1 creates the agent account, funds it, and adds the signer key scoped to Pactora', () => {
    expect(create).toEqual({
      receiverId: 'probe.alice.testnet',
      actions: [
        {type: 'CreateAccount'},
        {type: 'Transfer', params: {deposit: '500000000000000000000000'}},
        {
          type: 'AddKey',
          params: {
            publicKey: KEY,
            accessKey: {
              permission: {receiverId: PACTORA, methodNames: [], allowance: '250000000000000000000000'},
            },
          },
        },
      ],
    });
  });

  it('tx 2 calls register_agent on Pactora with the storage deposit', () => {
    expect(register).toEqual({
      receiverId: PACTORA,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'register_agent',
            args: {wallet: 'probe.alice.testnet', card_uri: args.cardUri},
            gas: '100000000000000',
            deposit: '100000000000000000000000',
          },
        },
      ],
    });
  });

  it('passes caps through only when set', () => {
    const [, withCaps] = registrationTransactions({
      ...args,
      perTaskCap: '1000000',
      dailyCap: '5000000',
      amounts: TESTNET_DEFAULTS,
    });
    expect(withCaps!.actions[0]).toMatchObject({
      params: {args: {per_task_cap: '1000000', daily_cap: '5000000'}},
    });
  });
});

describe('agentIdFromOutcome', () => {
  it('reads the u64 register_agent returned (base64 JSON)', () => {
    expect(agentIdFromOutcome(ok('17'))).toBe('17');
    expect(agentIdFromOutcome(ok('"17"'))).toBe('17');
  });

  it('keeps a u64 beyond 2^53 exact', () => {
    expect(agentIdFromOutcome(ok('18446744073709551615'))).toBe('18446744073709551615');
  });

  it('says why when the call failed or returned something else', () => {
    expect(() =>
      agentIdFromOutcome({
        status: {Failure: {ActionError: {kind: {FunctionCallError: 'InsufficientStorage'}}}},
      }),
    ).toThrow(/InsufficientStorage/);
    expect(() => agentIdFromOutcome(ok('{"id":1}'))).toThrow(/agent id/);
    expect(() => agentIdFromOutcome(undefined)).toThrow(/no outcome/);
  });
});

describe('nonceBytes', () => {
  it('turns the API nonce (64 hex) into the 32 bytes NEP-413 needs', () => {
    const bytes = nonceBytes('00ff'.repeat(16));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
    expect([bytes[0], bytes[1]]).toEqual([0, 255]);
  });

  it('refuses anything that is not exactly 32 bytes of hex', () => {
    expect(() => nonceBytes('ab'.repeat(16))).toThrow(/32 bytes/);
    expect(() => nonceBytes(`0x${'ab'.repeat(31)}`)).toThrow(/32 bytes/);
  });
});

describe('registerOnChain', () => {
  it('sends both transactions as the owner and returns the new agent id', async () => {
    const w = fakeWallet();
    const got = await registerOnChain(w, {...args, amounts: TESTNET_DEFAULTS});
    expect(got.chainAgentId).toBe('17');
    expect(w.signAndSendTransactions).toHaveBeenCalledWith(
      expect.objectContaining({signerId: 'alice.testnet', network: 'testnet'}),
    );
    const sent = w.signAndSendTransactions.mock.calls[0] as unknown as [{transactions: unknown[]}];
    expect(sent[0].transactions).toHaveLength(2);
  });

  it('checks the input before the wallet is asked anything', async () => {
    const w = fakeWallet();
    await expect(
      registerOnChain(w, {...args, wallet: 'probe.bob.testnet', amounts: TESTNET_DEFAULTS}),
    ).rejects.toThrow(/sub-account/);
    await expect(
      registerOnChain(w, {...args, walletPublicKey: 'nope', amounts: TESTNET_DEFAULTS}),
    ).rejects.toThrow(/ed25519/);
    await expect(
      registerOnChain(w, {...args, pactora: 'Not An Account', amounts: TESTNET_DEFAULTS}),
    ).rejects.toThrow(/contract/);
    expect(w.signAndSendTransactions).not.toHaveBeenCalled();
  });

  it('stops at a failed account creation rather than reading an id that does not exist', async () => {
    const w = fakeWallet([{status: {Failure: {ActionError: {kind: 'AccountAlreadyExists'}}}}, ok('17')]);
    await expect(registerOnChain(w, {...args, amounts: TESTNET_DEFAULTS})).rejects.toThrow(
      /AccountAlreadyExists/,
    );
  });
});

describe('signChallenge (NEP-413)', () => {
  it('passes message, recipient and the 32-byte nonce to the wallet', async () => {
    const w = fakeWallet();
    const signed = await signChallenge(w, 'alice.testnet', {
      message: 'Pactora: sign me',
      recipient: 'pactora',
      nonce: 'ab'.repeat(32),
    });
    expect(signed).toEqual({accountId: 'alice.testnet', publicKey: 'ed25519:owner', signature: 'c2ln'});
    const [params] = w.signMessage.mock.calls[0] as unknown as [
      {message: string; recipient: string; nonce: Uint8Array; signerId: string},
    ];
    expect(params.message).toBe('Pactora: sign me');
    expect(params.recipient).toBe('pactora');
    expect(params.signerId).toBe('alice.testnet');
    expect(params.nonce.length).toBe(32);
  });
});
