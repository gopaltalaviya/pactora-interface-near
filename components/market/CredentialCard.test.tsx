// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CredentialCard} from './CredentialCard';

vi.mock('@/lib/session', () => ({
  useSession: () => ({status: 'in', authed: <T,>(run: (t: string) => Promise<T>) => run('ps_token')}),
}));

const JOB = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTRACT = 'credentials.gopalt.testnet';
const none = {status: 'none', tokenId: null, contract: null, txHash: null, explorerUrl: null};
const minted = {
  status: 'minted',
  tokenId: '68',
  contract: CONTRACT,
  txHash: 'MINTTX1',
  explorerUrl: 'https://testnet.nearblocks.io/txns/MINTTX1',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

/** A fetch that answers GET and POST of the credential route from the two given handlers. */
function api(get: () => Response | Promise<Response>, post?: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    expect(url).toContain(`/v1/jobs/${JOB}/credential`);
    if ((init.method ?? 'GET') === 'POST') {
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer ps_token');
      return post ? post() : json(500, {});
    }
    return get();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const card = () => screen.getByRole('region', {name: 'Work credential'});
const claim = () => screen.findByRole('button', {name: 'Claim your work credential'});

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('CredentialCard', () => {
  it('offers the claim, says what it is and that it costs the worker nothing', async () => {
    api(() => json(200, none));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    expect(await claim()).toBeTruthy();
    const text = card().textContent ?? '';
    expect(text).toContain('non-transferable NFT on NEAR');
    expect(text).toContain('costs you nothing');
  });

  it('claims: busy while it is issued, then shows the token, the explorer link and the wallet note', async () => {
    let release!: (r: Response) => void;
    const fetch = api(
      () => json(200, none),
      () => new Promise<Response>((r) => (release = r)),
    );
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    fireEvent.click(await claim());
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Claim your work credential'}).getAttribute('aria-busy')).toBe(
        'true',
      ),
    );
    expect(screen.getByTestId('credential-status').textContent).toContain('Issuing your credential');
    release(json(202, minted));
    const status = await screen.findByTestId('credential-minted');
    expect(status.textContent).toContain('Credential #68');
    expect(status.textContent).toContain(CONTRACT);
    expect(status.textContent).toContain('NEAR wallet');
    const link = within(card()).getByRole('link', {name: /issuing transaction/});
    expect(link.getAttribute('href')).toBe('https://testnet.nearblocks.io/txns/MINTTX1');
    expect(
      fetch.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('shows an already-issued credential without offering the claim again', async () => {
    api(() => json(200, minted));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    expect((await screen.findByTestId('credential-minted')).textContent).toContain('Credential #68');
    expect(screen.queryByRole('button', {name: 'Claim your work credential'})).toBeNull();
  });

  it('drops an explorer link that is not on a known explorer', async () => {
    api(() => json(200, {...minted, explorerUrl: 'javascript:alert(1)'}));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    await screen.findByTestId('credential-minted');
    expect(within(card()).queryByRole('link', {name: /issuing transaction/})).toBeNull();
  });

  it('says plainly when the server cannot issue credentials (503), with the reason it gave', async () => {
    api(
      () => json(200, none),
      () => json(503, {code: 'UPSTREAM_UNAVAILABLE', detail: 'no credentials minter is configured'}),
    );
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    fireEvent.click(await claim());
    const box = await screen.findByTestId('credential-unavailable');
    expect(box.textContent).toContain('cannot issue work credentials right now');
    expect(box.textContent).toContain('no credentials minter is configured');
    expect(box.textContent).toContain('Your job and your payment are not affected');
  });

  it('shows a refusal in the API’s words, and offers a retry only when one could help', async () => {
    let n = 0;
    api(
      () => json(200, none),
      () =>
        ++n === 1
          ? json(409, {code: 'INVALID_STATE', detail: 'the job has not settled on chain yet'})
          : json(500, {}),
    );
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    fireEvent.click(await claim());
    expect((await screen.findByRole('alert')).textContent).toContain('the job has not settled on chain yet');
    expect(screen.queryByRole('button', {name: 'Try again'})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Claim your work credential'}));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('(500)'));
    expect(screen.getByRole('button', {name: 'Try again'})).toBeTruthy();
  });

  it('says a pending credential is being issued and lets the worker check again', async () => {
    let calls = 0;
    api(() => json(200, ++calls === 1 ? {...none, status: 'pending'} : minted));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} pollMs={0} />);
    expect((await screen.findByTestId('credential-status')).textContent).toContain(
      'Your credential is being issued',
    );
    fireEvent.click(screen.getByRole('button', {name: 'Check again'}));
    expect((await screen.findByTestId('credential-minted')).textContent).toContain('Credential #68');
  });

  it('says when the credential could not be looked up, with a retry', async () => {
    let calls = 0;
    api(() => (++calls === 1 ? Promise.reject(new TypeError('offline')) : json(200, none)));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot reach the Pactora API');
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    expect(await claim()).toBeTruthy();
  });

  it('says so, and offers no claim, when the API answers that this network issues none', async () => {
    api(() => json(200, {...none, available: false}));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    expect((await screen.findByTestId('credential-unavailable')).textContent).toContain(
      'this network has no credentials contract',
    );
    expect(screen.queryByRole('button', {name: 'Claim your work credential'})).toBeNull();
  });

  it('announces every change of state politely', async () => {
    api(() => json(200, none));
    render(<CredentialCard jobId={JOB} contract={CONTRACT} />);
    await claim();
    expect(card().querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
