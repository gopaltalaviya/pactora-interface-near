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
  chainId: testnet ? 10143 : 143,
  name: testnet ? 'Monad Testnet' : 'Monad',
  testnet,
  contracts: {TaskEscrow: '0x4feED0338761817417Fd1dDdFC8331D16AEB370D'},
});

/**
 * The badge is the one fact a viewer must never have to guess, and its honest
 * failure mode is to admit it does not know — never to default to "testnet".
 */
describe('NetworkBadge', () => {
  it('says testnet on a testnet', async () => {
    serve(network(true));
    render(<NetworkBadge />);
    expect((await screen.findByText(/Monad Testnet/)).textContent).toContain('testnet');
  });

  it('says REAL FUNDS on a mainnet, in words', async () => {
    serve(network(false));
    render(<NetworkBadge />);
    expect((await screen.findByText(/REAL FUNDS/)).textContent).toBe('Monad · REAL FUNDS');
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
