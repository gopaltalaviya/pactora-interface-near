// @vitest-environment happy-dom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import run from '@/lib/swarm-run.json';
import {replaySteps, STEP_MS, SwarmReplay} from './SwarmReplay';

/** Reduced motion on or off, as the browser would answer. */
function motion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: reduce && q.includes('reduce'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

beforeEach(() => motion(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const props = {choices: run.choices, bids: run.bids, pool: run.pool, subcontract: run.subcontract};

describe('replaySteps', () => {
  it('walks the recorded run: round 1 bids, its winners, round 2 by reputation, the pool, the subcontract', () => {
    const steps = replaySteps(props);
    expect(steps.map((s) => s.title)).toEqual([
      'Round 1: sellers bid',
      'Round 1: buyers choose',
      'Round 2: reputation decides',
      'Round 3: three buyers pool their money',
      'Round 4: a seller subcontracts',
    ]);
    expect(steps[0]!.text).toContain('9 bids on 3 listings');
    expect(steps[1]!.text).toContain('Buyer 01 chose Atlas');
    expect(steps[2]!.text).toContain('Cobalt');
    expect(steps[2]!.text).toContain('reputation 52');
    expect(steps[3]!.text).toContain('Buyer 01, Buyer 02, Buyer 03');
    expect(steps[4]!.text).toContain('Buyer 04 hired Cobalt, which hired Atlas');
  });

  it('leaves out the pool and the subcontract when the run had none', () => {
    expect(replaySteps({...props, pool: null, subcontract: null})).toHaveLength(3);
  });
});

describe('SwarmReplay', () => {
  it('steps forward and back with buttons, and announces each step', () => {
    render(<SwarmReplay {...props} />);
    const live = screen.getByTestId('replay-status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Step 1 of 5: Round 1: sellers bid');
    const prev = screen.getByRole('button', {name: 'Previous step'}) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', {name: 'Next step'}));
    expect(live.textContent).toContain('Step 2 of 5: Round 1: buyers choose');
    fireEvent.click(prev);
    expect(live.textContent).toContain('Step 1 of 5');
  });

  it('plays through every step on its own, and pauses', () => {
    vi.useFakeTimers();
    render(<SwarmReplay {...props} />);
    fireEvent.click(screen.getByRole('button', {name: 'Play'}));
    expect(screen.getByRole('button', {name: 'Pause'})).toBeTruthy();
    act(() => void vi.advanceTimersByTime(STEP_MS + 100));
    expect(screen.getByTestId('replay-status').textContent).toContain('Step 2 of 5');
    fireEvent.click(screen.getByRole('button', {name: 'Pause'}));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId('replay-status').textContent).toContain('Step 2 of 5');
    fireEvent.click(screen.getByRole('button', {name: 'Play'}));
    // One step per timer; React schedules the next once the last has rendered.
    for (let i = 0; i < 6; i++) act(() => void vi.advanceTimersByTime(STEP_MS + 100));
    expect(screen.getByTestId('replay-status').textContent).toContain('Step 5 of 5');
    // At the end it stops, and Play starts over.
    expect(screen.getByRole('button', {name: 'Play'})).toBeTruthy();
  });

  it('with reduced motion shows every step at once, with nothing to play', () => {
    motion(true);
    render(<SwarmReplay {...props} />);
    expect(screen.queryByRole('button', {name: 'Play'})).toBeNull();
    expect(screen.getAllByTestId('replay-step')).toHaveLength(5);
  });
});
