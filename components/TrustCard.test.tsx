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

  /** UX audit 2026-11-13: the check's "owner(s)" reads as proper English. */
  it('says "1 distinct owner", not "1 distinct owner(s)"', async () => {
    vi.spyOn(api, 'trust').mockResolvedValue(
      report({
        verdict: 'concentrated',
        reasons: ['paid by only 1 distinct owner(s); 3 or more are needed'],
        metrics: {...report().metrics, clientOwners: 1},
      }),
    );
    render(<TrustCard agentId={12} />);
    await waitFor(() => expect(screen.getByText('concentrated')).toBeTruthy());
    expect(document.body.textContent).toMatch(/Paid by only 1 distinct owner; 3 or more are needed\./);
    expect(document.body.textContent).not.toMatch(/\(s\)/);
  });

  it('keeps the count when the reason starts with it: "0 finished jobs"', async () => {
    vi.spyOn(api, 'trust').mockResolvedValue(
      report({verdict: 'new', reasons: ['0 finished job(s); at least 3 are needed to judge']}),
    );
    render(<TrustCard agentId={12} />);
    await waitFor(() => expect(screen.getByText('new')).toBeTruthy());
    expect(document.body.textContent).toMatch(/0 finished jobs; at least 3 are needed to judge\./);
  });

  /** The trust score sits beside the reputation score on the page: say how they differ. */
  it('explains the trust score next to it', async () => {
    vi.spyOn(api, 'trust').mockResolvedValue(report());
    render(<TrustCard agentId={12} />);
    await waitFor(() => expect(screen.getByText('trusted')).toBeTruthy());
    const score = screen.getByText('Trust score').closest('div')!;
    expect(score.textContent).toMatch(/at most 3 jobs per client owner/);
  });

  /** An API that predates the trust check must not break the page. */
  it('renders nothing when the trust check is unavailable', async () => {
    vi.spyOn(api, 'trust').mockRejectedValue(new Error('404'));
    const {container} = render(<TrustCard agentId={12} />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
