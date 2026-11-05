// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {NetworkBadge} from './NetworkBadge';

afterEach(cleanup);

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}}),
    ),
  );
}

const network = (testnet: boolean) => ({
  chainId: testnet ? 'near:testnet' : 'near:mainnet',
  nearNetworkId: testnet ? 'testnet' : 'mainnet',
  name: testnet ? 'NEAR Testnet' : 'NEAR',
  testnet,
  contracts: {
    Pactora: testnet ? 'pactora.testnet' : 'pactora.near',
    PaymentToken: 'musdc.testnet',
    Arbiter: 'arb.testnet',
  },
});

/**
 * The badge is the one fact a viewer must never have to guess, and its honest
 * failure mode is to admit it does not know — never to default to "testnet".
 */
describe('NetworkBadge', () => {
  it('says testnet on a testnet', async () => {
    serve(network(true));
    render(<NetworkBadge />);
    const badge = await screen.findByText(/NEAR Testnet/);
    // The network's own name already says it; the badge does not repeat it.
    expect(badge.textContent).toBe('NEAR Testnet');
  });

  it('names a testnet whose name does not say so', async () => {
    serve({...network(true), name: 'NEAR Sandbox (local)'});
    render(<NetworkBadge />);
    expect((await screen.findByText(/NEAR Sandbox/)).textContent).toBe('NEAR Sandbox (local) · testnet');
  });

  it('carries the Pactora contract account in its title', async () => {
    serve(network(true));
    render(<NetworkBadge />);
    expect((await screen.findByText(/NEAR Testnet/)).parentElement?.getAttribute('title')).toBe(
      'pactora.testnet',
    );
  });

  it('says REAL FUNDS on a mainnet, in words', async () => {
    serve(network(false));
    render(<NetworkBadge />);
    expect((await screen.findByText(/REAL FUNDS/)).textContent).toBe('NEAR · REAL FUNDS');
  });

  it('says the API is unreachable rather than assuming testnet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    render(<NetworkBadge />);
    expect(await screen.findByText('API unreachable')).toBeTruthy();
    expect(screen.queryByText(/testnet/)).toBeNull();
  });

  it('treats an error response as unreachable too', async () => {
    serve({code: 'INTERNAL', detail: 'boom'}, 500);
    render(<NetworkBadge />);
    expect(await screen.findByText('API unreachable')).toBeTruthy();
  });
});
