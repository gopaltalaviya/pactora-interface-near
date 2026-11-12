'use client';

import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/Button';
import {Icon} from '@/components/ui/Icon';
import {prefersReducedMotion} from '@/components/ui/Motion';

/**
 * The swarm run replayed (2026-11-12): the rounds of lib/swarm-run.json one
 * step at a time — round 1's bids and winners, round 2 won on reputation, the
 * pool filling, the subcontract chain. Play advances on a timer; Previous and
 * Next step by hand; the current step is announced politely. With reduced
 * motion there is nothing to play: every step is shown at once, still.
 */

interface Option {
  seller: string;
  price: string;
  reputation: number;
  score: number;
}
interface Choice {
  round: number;
  buyer: string;
  chose: string;
  options: Option[];
}
interface Pool {
  worker: string;
  share: string;
  total: string;
  members: string[];
}
interface Subcontract {
  client: string;
  middle: string;
  sub: string;
  parent: {amount: string};
  child: {amount: string};
}

export interface ReplayProps {
  choices: Choice[];
  bids: {round: number}[];
  pool: Pool | null;
  subcontract: Subcontract | null;
}

type Step =
  | {kind: 'bids' | 'choose'; round: number; title: string; text: string}
  | {kind: 'pool'; title: string; text: string}
  | {kind: 'subcontract'; title: string; text: string};

/** How long Play shows each step. */
export const STEP_MS = 2500;

const usdc = (base: string) =>
  `${(Number(base) / 1e6).toLocaleString('en-US', {maximumFractionDigits: 6})} mUSDC`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const count = (n: number) => WORDS[n] ?? String(n);

/** The steps of the replay, in order, from the run's own data. */
export function replaySteps({choices, bids, pool, subcontract}: ReplayProps): Step[] {
  const rounds = [...new Set(choices.map((c) => c.round))].sort((a, b) => a - b);
  const steps: Step[] = [];
  for (const [n, round] of rounds.entries()) {
    const these = choices.filter((c) => c.round === round);
    const chose = these.map((c) => `${c.buyer} chose ${c.chose}`).join(', ');
    if (n === 0) {
      const sellers = [...new Set(these.flatMap((c) => c.options.map((o) => o.seller)))];
      steps.push({
        kind: 'bids',
        round,
        title: `Round ${round}: sellers bid`,
        text: `${sellers.join(', ')} bid by rule: ${bids.filter((b) => b.round === round).length} bids on ${these.length} listings.`,
      });
      steps.push({
        kind: 'choose',
        round,
        title: `Round ${round}: buyers choose`,
        text: `Each buyer takes the best score of price and reputation: ${chose}.`,
      });
    } else {
      const rep = new Map(these.flatMap((c) => c.options.map((o) => [o.seller, o.reputation] as const)));
      const reps = [...rep]
        .sort((a, b) => b[1] - a[1])
        .map(([s, r]) => `${s} reputation ${r}`)
        .join(', ');
      steps.push({
        kind: 'choose',
        round,
        title: `Round ${round}: reputation decides`,
        text: `Round ${rounds[n - 1]}’s settlements wrote reputation on chain (${reps}), and buyers weigh it with price: ${chose}.`,
      });
    }
  }
  let next = (rounds.at(-1) ?? 0) + 1;
  if (pool)
    steps.push({
      kind: 'pool',
      title: `Round ${next++}: ${count(pool.members.length)} buyers pool their money`,
      text: `${pool.members.join(', ')} each pay ${usdc(pool.share)} into one ${usdc(pool.total)} job from ${pool.worker}, one none of them could buy alone.`,
    });
  if (subcontract)
    steps.push({
      kind: 'subcontract',
      title: `Round ${next}: a seller subcontracts`,
      text: `${subcontract.client} hired ${subcontract.middle}, which hired ${subcontract.sub} for half the work: ${usdc(subcontract.parent.amount)} in, ${usdc(subcontract.child.amount)} out.`,
    });
  return steps;
}

export function SwarmReplay(props: ReplayProps) {
  const steps = replaySteps(props);
  const last = steps.length - 1;
  const [reduced, setReduced] = useState(false);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setAt(Math.min(at + 1, last));
      if (at + 1 >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, at, last]);

  if (steps.length === 0) return null;

  if (reduced)
    return (
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} data-testid="replay-step" className="space-y-2">
            <h3 className="text-sm font-semibold">
              {i + 1}. {s.title}
            </h3>
            <p className="text-xs text-muted">{s.text}</p>
            <Panel step={s} props={props} instant />
          </li>
        ))}
      </ol>
    );

  const step = steps[at]!;
  const go = (i: number) => {
    setPlaying(false);
    setAt(Math.max(0, Math.min(i, last)));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (playing) return setPlaying(false);
            if (at === last) setAt(0);
            setPlaying(true);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(at - 1)} disabled={at === 0}>
          <Icon name="arrowLeft" className="size-3.5" />
          Previous step
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(at + 1)} disabled={at === last}>
          Next step
          <Icon name="arrowRight" className="size-3.5" />
        </Button>
      </div>
      <p data-testid="replay-status" aria-live="polite" className="text-sm">
        <span className="tabular text-muted">
          Step {at + 1} of {steps.length}:
        </span>{' '}
        <strong>{step.title}</strong>. <span className="text-muted">{step.text}</span>
      </p>
      <div className="min-h-36">
        <Panel key={at} step={step} props={props} />
      </div>
    </div>
  );
}

function Panel({step, props, instant = false}: {step: Step; props: ReplayProps; instant?: boolean}) {
  if (step.kind === 'pool' && props.pool) return <PoolPanel pool={props.pool} instant={instant} />;
  if (step.kind === 'subcontract' && props.subcontract)
    return <SubcontractPanel sc={props.subcontract} instant={instant} />;
  if (step.kind === 'bids' || step.kind === 'choose')
    return (
      <BidsPanel
        choices={props.choices.filter((c) => c.round === step.round)}
        reveal={step.kind === 'choose'}
        showRep={step.round !== props.choices[0]?.round}
      />
    );
  return null;
}

function BidsPanel({choices, reveal, showRep}: {choices: Choice[]; reveal: boolean; showRep: boolean}) {
  return (
    <ul className="space-y-2 text-xs" aria-hidden>
      {choices.map((c) => (
        <li key={c.buyer} className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 font-medium">{c.buyer}</span>
          {[...c.options]
            .sort((a, b) => Number(a.price) - Number(b.price))
            .map((o, i) => {
              const won = reveal && o.seller === c.chose;
              return (
                <span
                  key={o.seller}
                  style={{animationDelay: `${i * 120}ms`}}
                  className={`inline-flex animate-enter items-center gap-1 rounded-md border px-2 py-1 motion-safe:transition-colors motion-safe:duration-500 ${
                    won ? 'border-accent bg-accent/10 text-text' : 'border-edge text-muted'
                  }`}
                >
                  {won && <Icon name="check" className="size-3 text-settled" />}
                  {o.seller} {usdc(o.price)}
                  {showRep && <span className="text-chain">· rep {o.reputation}</span>}
                </span>
              );
            })}
        </li>
      ))}
    </ul>
  );
}

function PoolPanel({pool, instant}: {pool: Pool; instant: boolean}) {
  const n = pool.members.length;
  const [filled, setFilled] = useState(instant ? n : 0);
  useEffect(() => {
    if (filled >= n) return;
    const t = setTimeout(() => setFilled(filled + 1), 450);
    return () => clearTimeout(t);
  }, [filled, n]);
  const paid = (BigInt(pool.share) * BigInt(filled)).toString();
  return (
    <div className="space-y-2 text-xs" aria-hidden>
      <ul className="flex flex-wrap gap-2">
        {pool.members.map((m, i) => (
          <li
            key={m}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 motion-safe:transition-colors motion-safe:duration-300 ${
              i < filled ? 'border-settled/50 text-text' : 'border-edge text-muted'
            }`}
          >
            <Icon name="coins" className={`size-3.5 ${i < filled ? 'text-settled' : ''}`} />
            {m} {usdc(pool.share)}
          </li>
        ))}
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-settled motion-safe:transition-[width] motion-safe:duration-500"
          style={{width: `${(filled / n) * 100}%`}}
        />
      </div>
      <p className="tabular text-muted">
        {usdc(paid)} of {usdc(pool.total)} in escrow for {pool.worker}
      </p>
    </div>
  );
}

function SubcontractPanel({sc, instant}: {sc: Subcontract; instant: boolean}) {
  const [shown, setShown] = useState(instant);
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => setShown(true), 700);
    return () => clearTimeout(t);
  }, [shown]);
  const box = 'rounded-md border border-edge bg-raised px-2.5 py-1.5 font-medium';
  const arrow = (amount: string) => (
    <span className="inline-flex flex-col items-center text-muted">
      <span className="tabular text-[0.6875rem]">{usdc(amount)}</span>
      <Icon name="arrowRight" className="size-4 text-chain" />
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-hidden>
      <span className={box}>{sc.client}</span>
      {arrow(sc.parent.amount)}
      <span className={box}>{sc.middle}</span>
      <span
        className={`inline-flex items-center gap-2 motion-safe:transition-opacity motion-safe:duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`}
      >
        {arrow(sc.child.amount)}
        <span className={box}>{sc.sub}</span>
      </span>
    </div>
  );
}
