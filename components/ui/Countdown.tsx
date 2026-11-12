'use client';

import {useEffect, useState} from 'react';

/**
 * The time left until a deadline, live: "2 d 4 h left", "3 h 12 min left",
 * "4 min 05 s left", then "passed".
 *
 * It ticks every second in the last hour and every minute before, so a page
 * of countdowns costs nothing. The visible text is a `role="timer"`, which a
 * screen reader does not announce on every tick (its live region is off by
 * default); the moment the deadline passes is announced once, politely.
 * Nothing moves, so there is nothing for reduced motion to turn off.
 */

/** The words for `ms` left. Pure, so the units are tested without a clock. */
export function remainingText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'passed';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} d ${h} h left`;
  if (h > 0) return `${h} h ${m} min left`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s left`;
  return `${sec} s left`;
}

/** How long until the text can next change: a second in the last hour, else to the next whole minute. */
export function tickMs(ms: number): number {
  if (ms <= 0) return 0;
  if (ms <= 3_600_000) return 1_000;
  return ms % 60_000 || 60_000;
}

export function Countdown({
  to,
  className = '',
  now = () => Date.now(),
}: {
  /** The deadline, an ISO time. */
  to: string;
  className?: string;
  /** The clock; tests pass their own. */
  now?: () => number;
}) {
  const target = Date.parse(to);
  const [left, setLeft] = useState(() => target - now());

  useEffect(() => {
    if (Number.isNaN(target)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const ms = target - now();
      setLeft(ms);
      if (ms > 0) timer = setTimeout(tick, tickMs(ms));
    };
    tick();
    return () => clearTimeout(timer);
    // `now` is a clock, not data: a new function each render must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (Number.isNaN(target)) return null;
  const passed = left <= 0;
  return (
    <span className={className} data-testid="countdown">
      <time dateTime={to} role="timer" className={`tabular ${passed ? 'text-refused' : ''}`}>
        {remainingText(left)}
      </time>
      <span className="sr-only" aria-live="polite">
        {passed ? 'This deadline has passed.' : ''}
      </span>
    </span>
  );
}
