// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import type {RunEvent} from '@/lib/api';
import {RunTrace} from './RunTrace';

afterEach(cleanup);

const JOB = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const at = 1_000;
const ev = (kind: RunEvent['kind'], payload: Record<string, unknown>): RunEvent => ({kind, payload, at});

describe('RunTrace', () => {
  /** v3: the trust check left an agent out before the model chose. */
  it('says which agent the trust check left out, and why, in words', () => {
    render(
      <RunTrace
        events={[
          ev('excluded', {
            capability: 'market-research',
            agentId: 12,
            verdict: 'self-funded',
            reason: '3 of 4 paid jobs (75%) were paid by a client this worker had funded',
          }),
        ]}
        startedAt={at}
      />,
    );
    const text = screen.getByRole('list').textContent ?? '';
    expect(text).toMatch(/#12/);
    expect(text).toMatch(/self-funded/);
    expect(text).toMatch(/3 of 4 paid jobs/);
    expect(text).not.toMatch(/\{/); // not the raw-JSON fallback
  });

  it('says it is waiting before the first event', () => {
    render(<RunTrace events={[]} startedAt={null} />);
    expect(screen.getByRole('status').textContent).toMatch(/waiting for the first event/i);
  });

  it('puts an explorer link on an on-chain line', () => {
    render(
      <RunTrace
        events={[ev('settled', {jobId: JOB, explorerUrl: 'https://testnet.monadexplorer.com/tx/0xabc'})]}
        startedAt={at}
      />,
    );
    const link = screen.getByRole('link', {name: /explorer/i});
    expect(link.getAttribute('href')).toBe('https://testnet.monadexplorer.com/tx/0xabc');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  // The regression this guards: the trace rendered any `explorerUrl` the API
  // sent as an href, so a `javascript:` URL would have run on click.
  it('renders no link for a URL that is not an https explorer link', () => {
    render(
      <RunTrace
        events={[
          ev('settled', {jobId: JOB, explorerUrl: 'javascript:alert(1)'}),
          ev('hired', {jobId: JOB, amount: '0.02 USDC', explorerUrl: 'https://evil.example/tx/1'}),
        ]}
        startedAt={at}
      />,
    );
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('shows the total as money when it knows the token', () => {
    render(
      <RunTrace
        events={[ev('finished', {spent: '50000'})]}
        startedAt={at}
        token={{symbol: 'USDC', decimals: 6}}
      />,
    );
    expect(screen.getByText('0.05 USDC')).toBeTruthy();
  });

  it('falls back to base units, saying so, when it does not', () => {
    render(<RunTrace events={[ev('finished', {spent: '50000'})]} startedAt={at} />);
    expect(screen.getByText('50000 base units')).toBeTruthy();
  });

  it('shortens a job id on screen and keeps the full id in its title', () => {
    render(<RunTrace events={[ev('disputed', {jobId: JOB, reason: 'off-topic'})]} startedAt={at} />);
    const id = screen.getByText('3f2a9c1e…');
    expect(id.getAttribute('title')).toBe(JOB);
  });

  it('announces lines as they arrive only while the run is live', () => {
    const {rerender} = render(<RunTrace events={[ev('planned', {subtasks: 2})]} startedAt={at} live />);
    expect(screen.getByRole('list', {name: 'Run trace'}).getAttribute('aria-live')).toBe('polite');
    rerender(<RunTrace events={[ev('planned', {subtasks: 2})]} startedAt={at} />);
    expect(screen.getByRole('list', {name: 'Run trace'}).getAttribute('aria-live')).toBeNull();
  });

  it('flags a caught injection attempt in words, not only in colour', () => {
    render(
      <RunTrace
        events={[ev('judged', {jobId: JOB, accept: false, quality: 10, injectionAttempted: true})]}
        startedAt={at}
      />,
    );
    expect(screen.getByText('reject')).toBeTruthy();
    expect(screen.getByText(/injection attempt caught/)).toBeTruthy();
  });
});
