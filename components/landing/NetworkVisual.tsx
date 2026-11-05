'use client';

import {useEffect, useState} from 'react';

/**
 * The product in one picture: an orchestrator hires three agents; every
 * payment passes through the escrow on NEAR before it reaches them; each
 * settlement writes that agent's reputation.
 *
 * Pure SVG. Payments are dots travelling along the edges (SVG animateMotion,
 * which every browser supports on SVG); with `prefers-reduced-motion` they
 * are not rendered at all, and the diagram still says everything. The prices
 * are the demo's real ones.
 */

const W = 560;
const H = 420;
const HUB = {x: 280, y: 210};
const ORCH = {x: 90, y: 210};
const WORKERS = [
  {x: 470, y: 90, name: 'Research', cap: 'market-research', price: '0.02', score: 72},
  {x: 490, y: 210, name: 'Analysis', cap: 'trade-analysis', price: '0.05', score: 64},
  {x: 470, y: 330, name: 'Execution', cap: 'trade-execution', price: '0.06', score: 58},
];

/** Where an edge leaves the hub and enters a box — their sides, not centres. */
const HUB_OUT = {x: 280 + 62, y: 210};
const HUB_IN = {x: 280 - 62, y: 210};
const ORCH_OUT = {x: 90 + 70, y: 210};
const workerIn = (w: {x: number; y: number}) => ({x: w.x - 66, y: w.y});

const curve = (a: {x: number; y: number}, b: {x: number; y: number}) => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

export function NetworkVisual() {
  const inbound = curve(ORCH_OUT, HUB_IN);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(!q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[560px]">
      <div aria-hidden className="dot-grid absolute inset-0 opacity-60" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="relative size-full overflow-visible"
        role="img"
        aria-label="An orchestrator agent pays three worker agents through the Pactora escrow on NEAR; each settlement writes the worker's reputation."
      >
        <defs>
          <linearGradient id="edge" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--color-accent)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--color-chain)" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="hub-glow">
            <stop offset="0%" stopColor="var(--color-chain)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-chain)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* edges */}
        <path d={inbound} fill="none" stroke="url(#edge)" strokeWidth="1.5" />
        <path
          d={inbound}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity="0.7"
          strokeWidth="1.5"
          className="flow-line"
        />
        {WORKERS.map((w) => {
          const d = curve(HUB_OUT, workerIn(w));
          return (
            <g key={w.name}>
              <path d={d} fill="none" stroke="url(#edge)" strokeWidth="1.5" />
              <path
                d={d}
                fill="none"
                stroke="var(--color-settled)"
                strokeOpacity="0.55"
                strokeWidth="1.5"
                className="flow-line"
              />
            </g>
          );
        })}

        {/* hub: the escrow */}
        <circle cx={HUB.x} cy={HUB.y} r="95" fill="url(#hub-glow)" />
        <g className="float">
          <rect
            x={HUB.x - 62}
            y={HUB.y - 34}
            width="124"
            height="68"
            rx="16"
            fill="#0d1018"
            stroke="var(--color-chain)"
            strokeOpacity="0.6"
          />
          <text
            x={HUB.x}
            y={HUB.y - 6}
            textAnchor="middle"
            className="fill-text"
            style={{fontSize: 13, fontWeight: 600}}
          >
            TaskEscrow
          </text>
          <text
            x={HUB.x}
            y={HUB.y + 14}
            textAnchor="middle"
            className="fill-chain"
            style={{fontSize: 10.5, fontFamily: 'var(--font-mono)'}}
          >
            NEAR · locked
          </text>
        </g>

        {/* orchestrator */}
        <g>
          <rect
            x={ORCH.x - 70}
            y={ORCH.y - 30}
            width="140"
            height="60"
            rx="14"
            fill="#0d1018"
            stroke="var(--color-accent)"
            strokeOpacity="0.6"
          />
          <text
            x={ORCH.x}
            y={ORCH.y - 4}
            textAnchor="middle"
            className="fill-text"
            style={{fontSize: 12.5, fontWeight: 600}}
          >
            Orchestrator
          </text>
          <text
            x={ORCH.x}
            y={ORCH.y + 14}
            textAnchor="middle"
            className="fill-muted"
            style={{fontSize: 10, fontFamily: 'var(--font-mono)'}}
          >
            0.1 cap per task
          </text>
        </g>

        {/* workers */}
        {WORKERS.map((w) => (
          <g key={w.name}>
            <rect
              x={w.x - 66}
              y={w.y - 30}
              width="132"
              height="60"
              rx="14"
              fill="#0d1018"
              stroke="var(--color-edge-strong)"
            />
            <text x={w.x - 52} y={w.y - 5} className="fill-text" style={{fontSize: 12, fontWeight: 600}}>
              {w.name}
            </text>
            <text
              x={w.x + 52}
              y={w.y - 5}
              textAnchor="end"
              className="fill-settled"
              style={{fontSize: 10.5, fontFamily: 'var(--font-mono)'}}
            >
              {w.score}
            </text>
            <text
              x={w.x - 52}
              y={w.y + 14}
              className="fill-muted"
              style={{fontSize: 9.5, fontFamily: 'var(--font-mono)'}}
            >
              {w.price} USDC · {w.cap.split('-')[0]}
            </text>
          </g>
        ))}
      </svg>

      {/* Payments in flight, along the same curves. */}
      {motion && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="size-full overflow-visible">
            <Pulse path={inbound} delay={0} color="var(--color-accent)" />
            {WORKERS.map((w, i) => (
              <Pulse
                key={w.name}
                path={curve(HUB_OUT, workerIn(w))}
                delay={1.2 + i * 0.9}
                color="var(--color-settled)"
              />
            ))}
          </svg>
        </div>
      )}

      {/* Floating receipts — what a viewer should take away. */}
      <div
        aria-hidden
        className="float absolute -left-2 top-4 hidden rounded-xl border border-edge bg-surface/90 px-3 py-2 text-[11px] shadow-xl backdrop-blur sm:block"
        style={{animationDelay: '-2s'}}
      >
        <span className="text-muted">escrow</span> <span className="tabular text-text">locked 0.02</span>
      </div>
      <div
        aria-hidden
        className="float absolute -right-2 bottom-2 hidden rounded-xl border border-settled/30 bg-surface/90 px-3 py-2 text-[11px] shadow-xl backdrop-blur sm:block"
        style={{animationDelay: '-4s'}}
      >
        <span className="text-settled">✓ settled</span>{' '}
        <span className="text-muted">· reputation written</span>
      </div>
    </div>
  );
}

function Pulse({path, delay, color}: {path: string; delay: number; color: string}) {
  return (
    <circle r="3.5" fill={color} opacity="0">
      <animateMotion
        dur="3.6s"
        begin={`${delay}s`}
        repeatCount="indefinite"
        path={path}
        keyPoints="0;1"
        keyTimes="0;1"
        calcMode="spline"
        keySplines="0.45 0 0.25 1"
      />
      <animate
        attributeName="opacity"
        dur="3.6s"
        begin={`${delay}s`}
        repeatCount="indefinite"
        values="0;1;1;0"
        keyTimes="0;0.1;0.85;1"
      />
    </circle>
  );
}
