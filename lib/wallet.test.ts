import {afterEach, describe, expect, it, vi} from 'vitest';
import {ensureChain, hasWallet, registerIdentity, signMessage} from './wallet';

afterEach(() => vi.unstubAllGlobals());

function wallet(handler: (method: string, params?: unknown[]) => unknown) {
  const request = vi.fn(async ({method, params}: {method: string; params?: unknown[]}) =>
    handler(method, params),
  );
  vi.stubGlobal('ethereum', {request});
  return request;
}

const REGISTRY = '0xeD34Ffc39Ee69c780586b85d930368Bc29B30ef1';
const OWNER = '0x0000000000000000000000000000000000000001';

const args = {
  registry: REGISTRY as `0x${string}`,
  agentURI: 'agentx://test',
  payoutWallet: OWNER as `0x${string}`,
  referenceImplementation: true,
  chainId: 10143,
  rpcUrl: 'https://testnet-rpc.monad.xyz',
};

describe('registerIdentity', () => {
  // Validation happens before the wallet is asked anything: a typo in the
  // payout wallet must not become a signed transaction.
  it('refuses a malformed payout wallet without touching the wallet', async () => {
    const request = wallet(() => [OWNER]);
    await expect(registerIdentity({...args, payoutWallet: '0x1234' as `0x${string}`})).rejects.toThrow(
      /payout wallet is not an address/,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a malformed registry address', async () => {
    const request = wallet(() => [OWNER]);
    await expect(registerIdentity({...args, registry: '0xnope' as `0x${string}`})).rejects.toThrow(
      /registry/,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a network with no usable RPC endpoint', async () => {
    const request = wallet(() => [OWNER]);
    await expect(registerIdentity({...args, rpcUrl: ''})).rejects.toThrow(/RPC/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('ensureChain', () => {
  const chain = {
    chainId: 10143,
    name: 'Monad Testnet',
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorerBaseUrl: 'https://testnet.monadexplorer.com',
    nativeCurrency: {name: 'MON', symbol: 'MON', decimals: 18},
  };

  it('adds the chain when the wallet has never seen it (4902)', async () => {
    const request = wallet((method) => {
      if (method === 'wallet_switchEthereumChain')
        throw Object.assign(new Error('unknown chain'), {code: 4902});
      return null;
    });
    await ensureChain(chain);
    const add = request.mock.calls.find(([c]) => c.method === 'wallet_addEthereumChain');
    expect(add?.[0].params?.[0]).toMatchObject({chainId: '0x279f', rpcUrls: [chain.rpcUrl]});
  });

  it('passes on any other refusal, such as the user saying no', async () => {
    wallet(() => {
      throw Object.assign(new Error('User rejected the request.'), {code: 4001});
    });
    await expect(ensureChain(chain)).rejects.toThrow(/rejected/);
  });
});

describe('hasWallet', () => {
  it('is false without an injected provider', () => {
    expect(hasWallet()).toBe(false);
  });
});

describe('signMessage', () => {
  it('asks the wallet to personal_sign the exact text, as the account given', async () => {
    const request = wallet((method) => (method === 'personal_sign' ? '0xsigned' : null));
    const message = 'Pactora: register an agent.\nNonce: 1';
    expect(await signMessage(OWNER as `0x${string}`, message)).toBe('0xsigned');
    const call = request.mock.calls.find(([c]) => c.method === 'personal_sign');
    // EIP-1193 personal_sign: [message as hex, address]
    expect(call?.[0].params).toEqual(['0x' + Buffer.from(message).toString('hex'), OWNER]);
  });
});
