// @vitest-environment happy-dom
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Countdown, remainingText, tickMs} from './Countdown';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('remainingText', () => {
  it('says the time left in the largest units a person reads', () => {
    expect(remainingText((2 * 86_400 + 4 * 3_600 + 59) * 1000)).toBe('2 d 4 h left');
    expect(remainingText((3 * 3_600 + 12 * 60 + 5) * 1000)).toBe('3 h 12 min left');
    expect(remainingText((4 * 60 + 5) * 1000)).toBe('4 min 05 s left');
    expect(remainingText(9_500)).toBe('9 s left');
    expect(remainingText(0)).toBe('passed');
    expect(remainingText(-1)).toBe('passed');
  });

  it('ticks each second in the last hour, else at the next whole minute', () => {
    expect(tickMs(30 * 60_000)).toBe(1_000);
    expect(tickMs(2 * 3_600_000 + 20_000)).toBe(20_000);
    expect(tickMs(2 * 3_600_000)).toBe(60_000);
  });
});

describe('Countdown', () => {
  it('counts down live, then says the deadline passed, once, to a screen reader', () => {
    vi.useFakeTimers();
    const start = Date.UTC(2026, 10, 12, 9, 0, 0);
    vi.setSystemTime(start);
    render(<Countdown to={new Date(start + 3_000).toISOString()} />);
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toBe('3 s left');
    expect(timer.getAttribute('datetime')).toBe(new Date(start + 3_000).toISOString());
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(timer.textContent).toBe('2 s left');
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(timer.textContent).toBe('passed');
    expect(screen.getByText('This deadline has passed.')).toBeTruthy();
  });

  it('renders nothing for a time it cannot read', () => {
    const {container} = render(<Countdown to="not a date" />);
    expect(container.textContent).toBe('');
  });
});
