// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {compareJob, VerifyOnChain} from './VerifyOnChain';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const want = {chainJobId: '55', amount: '21000', resultHash: 'aa'};
const job = {state: 'Settled', amount: '21000', result_hash: 'aa'};

/** The RPC answer for a view call: the JSON result as bytes. */
const rpc = (value: unknown) =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'pactora',
      result: {result: [...new TextEncoder().encode(JSON.stringify(value))]},
    }),
  );

describe('compareJob', () => {
  it('passes a settled job with the same amount and result hash', () => {
    expect(compareJob(want, job)).toEqual({chainJobId: '55', ok: true});
  });
  it('fails a missing job, another state, another amount or another hash, and says which', () => {
    expect(compareJob(want, null)).toMatchObject({ok: false, why: 'the contract has no such job'});
    expect(compareJob(want, {...job, state: 'Submitted'})).toMatchObject({
      ok: false,
      why: 'state is Submitted',
    });
    expect(compareJob(want, {...job, amount: '1'})).toMatchObject({ok: false, why: 'amount is 1'});
    expect(compareJob(want, {...job, result_hash: 'bb'})).toMatchObject({
      ok: false,
      why: 'the result hash differs',
    });
  });
});

describe('VerifyOnChain', () => {
  it('reads each job from the RPC node, by number, and reports how many match', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const params = JSON.parse(String(init.body)).params;
      const args = JSON.parse(atob(params.args_base64));
      expect(params).toMatchObject({account_id: 'pactora.gopalt.testnet', method_name: 'get_job'});
      return rpc(args.job_id === 55 ? job : {...job, state: 'Refunded'});
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <VerifyOnChain
        contract="pactora.gopalt.testnet"
        jobs={[want, {...want, chainJobId: '56'}]}
        rpcUrl="https://rpc.test"
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Verify on chain'}));
    expect((await screen.findByTestId('swarm-verify-result')).textContent).toContain('1 of 2 jobs');
    expect(screen.getByText(/chain job 56: state is Refunded/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toBe('https://rpc.test');
  });

  it('says so when the RPC node cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    render(<VerifyOnChain contract="pactora.gopalt.testnet" jobs={[want]} />);
    fireEvent.click(screen.getByRole('button', {name: 'Verify on chain'}));
    expect((await screen.findByTestId('swarm-verify-result')).textContent).toContain(
      'Cannot reach the NEAR RPC node',
    );
  });
});
