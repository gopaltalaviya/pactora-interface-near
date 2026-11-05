// @vitest-environment happy-dom
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {api, type TrustReport} from '@/lib/api';
import {TrustCard} from './TrustCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const report = (over: Partial<TrustReport> = {}): TrustReport => ({
  agentId: '12',
  chainId: 'near:testnet',
  verdict: 'trusted',
  reasons: ['8 paid jobs from 6 distinct owners; none self-funded; 0% failed'],
  metrics: {
    settled: 8,
    failed: 0,
    volume: '400000',
    clientOwners: 6,
    topOwnerSettled: 2,
    selfFunded: 0,
    trustScore: 71,
  },
  fundingWindowBlocks: 9000,
  indexedToBlock: '73990000',
  ...over,
});

describe('TrustCard', () => {
  it('shows the verdict and the reason in the check’s own words', async () => {
    vi.spyOn(api, 'trust').mockResolvedValue(report());
    render(<TrustCard agentId={12} />);
    await waitFor(() => expect(screen.getByText('trusted')).toBeTruthy());
    expect(document.body.textContent).toMatch(/8 paid jobs from 6 distinct owners/);
    expect(document.body.textContent).toMatch(/up to block 73990000/);
  });

  it('marks self-funded payments as a warning', async () => {
    vi.spyOn(api, 'trust').mockResolvedValue(
      report({
        verdict: 'self-funded',
        reasons: ['3 of 4 paid jobs (75%) were paid by a client that had just received money from this side'],
        metrics: {...report().metrics, settled: 4, selfFunded: 3, trustScore: 50},
      }),
    );
    render(<TrustCard agentId={12} />);
    await waitFor(() => expect(screen.getByText('self-funded')).toBeTruthy());
    expect(document.body.textContent).toMatch(/funded by its own side/);
    expect(screen.getByText('3').className).toMatch(/text-broken/);
  });

  /** An API that predates the trust check (v2) must not break the page. */
  it('renders nothing when the trust check is unavailable', async () => {
    vi.spyOn(api, 'trust').mockRejectedValue(new Error('404'));
    const {container} = render(<TrustCard agentId={12} />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
