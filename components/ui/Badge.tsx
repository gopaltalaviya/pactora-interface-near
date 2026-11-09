import type {ReactNode} from 'react';

/**
 * Status, said the same way everywhere.
 *
 * Tones are semantic, never decorative: settled is money that moved, refused
 * is the system deciding no, broken is something actually wrong, live is
 * happening now. A step, a run and an agent all use the same four.
 */
export type Tone = 'settled' | 'refused' | 'broken' | 'live' | 'neutral' | 'chain';

const TONE: Record<Tone, string> = {
  settled: 'border-settled/25 bg-settled/[0.09] text-settled',
  refused: 'border-refused/25 bg-refused/[0.09] text-refused',
  broken: 'border-broken/25 bg-broken/[0.09] text-broken',
  live: 'border-accent/25 bg-accent/[0.09] text-accent',
  neutral: 'border-edge bg-raised text-muted',
  chain: 'border-chain/25 bg-chain/[0.09] text-chain',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {dot && <StatusDot tone={tone} pulse={tone === 'live'} />}
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  settled: 'bg-settled text-settled',
  refused: 'bg-refused text-refused',
  broken: 'bg-broken text-broken',
  live: 'bg-accent text-accent',
  neutral: 'bg-muted text-muted',
  chain: 'bg-chain text-chain',
};

/** A dot; pulsing only while something is genuinely in progress. */
export function StatusDot({tone = 'neutral', pulse = false}: {tone?: Tone; pulse?: boolean}) {
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${DOT[tone]} ${pulse ? 'animate-pulse-ring' : ''}`}
    />
  );
}

/** Capability tags. */
export function Tag({children}: {children: ReactNode}) {
  return (
    <span className="tabular rounded-md border border-edge bg-raised/70 px-2 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}
