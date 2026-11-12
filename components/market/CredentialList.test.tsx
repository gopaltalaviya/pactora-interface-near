// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {NetworkInfo} from '@/lib/api';
import {CredentialList} from './CredentialList';

const CONTRACT = 'credentials.gopalt.testnet';
const network = {
  chainId: 'near:testnet',
  nearNetworkId: 'testnet',
  name: 'NEAR Testnet',
  testnet: true,
  paymentToken: {symbol: 'USDC', decimals: 6, accountId: 'musdc.pactora.testnet'},
  contracts: {
    Pactora: 'pactora.testnet',
    PaymentToken: 'musdc.pactora.testnet',
    Arbiter: 'arb.testnet',
    Credentials: CONTRACT,
  },
  rpcUrls: ['https://rpc.test'],
  nativeCurrency: {name: 'NEAR', symbol: 'NEAR', decimals: 24},
  explorerBaseUrl: 'https://testnet.nearblocks.io',
  fastPathMaxDisplay: '5 USDC',
  protocolFeeBps: 100,
} satisfies NetworkInfo;

const credential = (id: string, amount: string, settledAt: string) => ({
  token_id: id,
  owner_id: 'wade.testnet',
  metadata: {
    title: `Pactora job #${id}`,
    description: 'A paid job on Pactora',
    media: null,
    issued_at: null,
    extra: JSON.stringify({
      contract: 'pactora.testnet',
      chainJobId: id,
      client: 'olive.testnet',
      worker: 'wade.testnet',
      amount,
      token: 'musdc.pactora.testnet',
      specHash: 'ab',
      resultHash: 'cd',
      reviewHash: null,
      settledAt,
    }),
  },
});

const rpc = (value: unknown) =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'pactora',
      result: {result: [...new TextEncoder().encode(JSON.stringify(value))]},
    }),
  );
const json = (body: unknown) => new Response(JSON.stringify(body), {status: 200});

/** The RPC node answers nft_tokens_for_owner with `tokens`; the API's receipts know job 5000. */
function stub(tokens: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.startsWith('https://rpc.test')) {
      const params = JSON.parse(String(init.body)).params;
      expect(params).toMatchObject({account_id: CONTRACT, method_name: 'nft_tokens_for_owner'});
      expect(JSON.parse(atob(params.args_base64))).toMatchObject({
        account_id: 'wade.testnet',
        from_index: '0',
      });
      return tokens();
    }
    if (url.includes('/v1/receipts'))
      return json({
        count: 1,
        receipts: [{jobId: 'aaaaaaaa-0000-4000-8000-000000000001', chainJobId: '5000'}],
      });
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const section = () => screen.getByRole('region', {name: 'Work credentials'});

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('CredentialList', () => {
  it('renders nothing, and reads nothing, when the network has no credentials contract', () => {
    const fetch = stub(() => rpc([]));
    const {contracts, ...rest} = network;
    const {Credentials, ...plain} = contracts;
    void Credentials;
    const {container} = render(<CredentialList owner="wade.testnet" network={{...rest, contracts: plain}} />);
    expect(container.textContent).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says it is reading while the chain answers', () => {
    stub(() => new Promise<Response>(() => undefined));
    render(<CredentialList owner="wade.testnet" network={network} />);
    expect(within(section()).getByRole('status').textContent).toContain('Reading credentials from the chain');
  });

  it('says how they are earned when there are none yet', async () => {
    stub(() => rpc([]));
    render(<CredentialList owner="wade.testnet" network={network} />);
    expect((await screen.findByTestId('credentials-empty')).textContent).toBe(
      'No credentials yet — they are issued when a job settles and its worker claims it.',
    );
  });

  it('lists each with its title, amount, settled date and a link to its job, and says how to verify', async () => {
    stub(() =>
      rpc([
        credential('5000', '4000000', '2026-11-02T10:00:00.000Z'),
        credential('68', '20000', '2026-11-12T09:30:00.000Z'),
      ]),
    );
    render(<CredentialList owner="wade.testnet" network={network} />);
    const items = await within(section()).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByTestId('credentials-count').textContent).toBe('2');
    expect(items[0]!.textContent).toContain('Pactora job #5000');
    expect(items[0]!.textContent).toContain('4 USDC');
    expect(items[0]!.textContent).toContain('2 Nov 2026');
    // Job 5000 is in the API's receipts: the link opens its job page.
    expect(
      within(items[0]!)
        .getByRole('link', {name: /job #5000/})
        .getAttribute('href'),
    ).toBe('/jobs/aaaaaaaa-0000-4000-8000-000000000001');
    // Job 68 is not: the link opens the token on the explorer instead.
    expect(
      within(items[1]!)
        .getByRole('link', {name: /credential #68 on the block explorer/})
        .getAttribute('href'),
    ).toBe(`https://testnet.nearblocks.io/nft-token/${CONTRACT}/68`);
    expect(items[1]!.textContent).toContain('0.02 USDC');
    const note = screen.getByTestId('credentials-verify');
    expect(note.textContent).toContain('Verify on chain');
    expect(note.textContent).toContain(CONTRACT);
    expect(note.textContent).toContain('nft_tokens_for_owner');
  });

  it('says when the chain could not be read, and reads again on request', async () => {
    let calls = 0;
    stub(() => (++calls === 1 ? Promise.reject(new TypeError('offline')) : rpc([])));
    render(<CredentialList owner="wade.testnet" network={network} />);
    expect((await within(section()).findByRole('alert')).textContent).toContain(
      'Could not read credentials from the chain',
    );
    fireEvent.click(screen.getByRole('button', {name: 'Read again'}));
    expect(await screen.findByTestId('credentials-empty')).toBeTruthy();
  });

  it('treats an answer that is not a list as a failed read, not as none', async () => {
    stub(() => rpc(null));
    render(<CredentialList owner="wade.testnet" network={network} />);
    expect((await within(section()).findByRole('alert')).textContent).toContain(
      'Could not read credentials from the chain',
    );
  });
});
