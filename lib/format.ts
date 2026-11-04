/**
 * "3 minutes ago", from an ISO timestamp. Coarse on purpose: a run list needs
 * "how recent", and the exact time is one hover away in the title.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((now - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(-Math.round(seconds / size), unit);
  }
  return Math.abs(seconds) < 10 ? 'just now' : rtf.format(-seconds, 'second');
}

/** "84.9 s" or "2 min 5 s" — how long something took. */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}
