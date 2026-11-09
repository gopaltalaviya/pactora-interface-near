'use client';

import {useEffect, useState} from 'react';

/**
 * The product in one picture: agents and people on both sides of the same
 * escrow. An agent and a person each hire through Pactora on NEAR; the work
 * goes to two agents and a person; every payment passes through the escrow
 * before it reaches the worker, and each settlement writes the worker's
 * reputation in the skill it was hired for.
 *
 * Pure SVG. Payments are dots travelling along the edges (SVG animateMotion,
 * which every browser supports on SVG); with `prefers-reduced-motion` they
 * are not rendered at all, and the diagram still says everything. The prices
 * are the demo's real ones (scripts/demo.mjs in the backend).
 */

type Kind = 'agent' | 'person';
type Pt = {x: number; y: number};

const W = 560;
const H = 420;
const HUB = {x: 280, y: 210};
const CLIENTS: (Pt & {name: string; kind: Kind; line: string})[] = [
  {x: 92, y: 140, name: 'Orchestrator', kind: 'agent', line: '0.1 cap per task'},
  {x: 92, y: 280, name: 'Shop owner', kind: 'person', line: 'own NEAR wallet'},
];
const WORKERS: (Pt & {name: string; kind: Kind; skill: string; price: string; score: number})[] = [
  {x: 470, y: 80, name: 'Research', kind: 'agent', skill: 'research', price: '0.02', score: 72},
  {x: 484, y: 210, name: 'Analysis', kind: 'agent', skill: 'analysis', price: '0.05', score: 64},
  {x: 470, y: 340, name: 'Photographer', kind: 'person', skill: 'photos', price: '0.04', score: 81},
];

const HUB_OUT = {x: HUB.x + 62, y: HUB.y};
const HUB_IN = {x: HUB.x - 62, y: HUB.y};
const clientOut = (c: Pt) => ({x: c.x + 74, y: c.y});
const workerIn = (w: Pt) => ({x: w.x - 74, y: w.y});

const curve = (a: Pt, b: Pt) => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

/** The kind of participant, as a small glyph: a chip for an agent, a head and shoulders for a person. */
function Glyph({x, y, kind}: {x: number; y: number; kind: Kind}) {
  return kind === 'agent' ? (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="var(--color-accent)" strokeWidth="1.3">
      <rect x="-5" y="-5" width="10" height="10" rx="2.5" />
      <path d="M-2.5 -7.5v2.5M2.5 -7.5v2.5M-2.5 5v2.5M2.5 5v2.5" />
    </g>
  ) : (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="var(--color-settled)" strokeWidth="1.3">
      <circle cx="0" cy="-3" r="3" />
      <path d="M-6 6c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" />
    </g>
  );
}

function Node({
  x,
  y,
  kind,
  name,
  sub,
  right,
  stroke,
}: Pt & {kind: Kind; name: string; sub: string; right?: string; stroke: string}) {
  return (
    <g>
      <rect
        x={x - 74}
        y={y - 31}
        width="148"
        height="62"
        rx="14"
        fill="var(--color-surface)"
        stroke={stroke}
        strokeOpacity="0.7"
      />
      <Glyph x={x - 56} y={y - 9} kind={kind} />
      <text x={x - 44} y={y - 5} className="fill-text" style={{fontSize: 12, fontWeight: 600}}>
        {name}
      </text>
      {right && (
        <text
          x={x + 62}
          y={y - 5}
          textAnchor="end"
          className="fill-settled"
          style={{fontSize: 10.5, fontVariantNumeric: 'tabular-nums'}}
        >
          {right}
        </text>
      )}
      <text x={x - 62} y={y + 16} className="fill-muted" style={{fontSize: 9.5}}>
        {kind} · {sub}
      </text>
    </g>
  );
}

export function NetworkVisual() {
  const inbound = CLIENTS.map((c) => curve(clientOut(c), HUB_IN));
  const outbound = WORKERS.map((w) => curve(HUB_OUT, workerIn(w)));
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
        aria-label="An agent and a person each hire through the Pactora escrow on NEAR: the work goes to two agents and a person, every payment is locked in escrow until it settles, and each settlement writes the worker's reputation."
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

        {/* edges: clients into the escrow, the escrow out to the workers */}
        {inbound.map((d, i) => (
          <g key={`in-${i}`}>
            <path d={d} fill="none" stroke="url(#edge)" strokeWidth="1.5" />
            <path
              d={d}
              fill="none"
              stroke="var(--color-accent)"
              strokeOpacity="0.7"
              strokeWidth="1.5"
              className="flow-line"
            />
          </g>
        ))}
        {outbound.map((d, i) => (
          <g key={`out-${i}`}>
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
        ))}

        {/* hub: the escrow */}
        <circle cx={HUB.x} cy={HUB.y} r="95" fill="url(#hub-glow)" />
        <g className="float">
          <rect
            x={HUB.x - 62}
            y={HUB.y - 34}
            width="124"
            height="68"
            rx="16"
            fill="var(--color-surface)"
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
            Pactora
          </text>
          <text
            x={HUB.x}
            y={HUB.y + 14}
            textAnchor="middle"
            className="fill-chain"
            style={{fontSize: 10.5, fontFamily: 'var(--font-mono)'}}
          >
            NEAR · escrow
          </text>
        </g>

        {CLIENTS.map((c) => (
          <Node key={c.name} {...c} sub={c.line} stroke="var(--color-accent)" />
        ))}
        {WORKERS.map((w) => (
          <Node
            key={w.name}
            {...w}
            sub={`${w.price} mUSDC · ${w.skill}`}
            right={String(w.score)}
            stroke="var(--color-edge-strong)"
          />
        ))}
      </svg>

      {/* Payments in flight, along the same curves: in from each client, then out to each worker. */}
      {motion && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="size-full overflow-visible">
            {inbound.map((d, i) => (
              <Pulse key={`in-${i}`} path={d} delay={i * 1.8} color="var(--color-accent)" />
            ))}
            {outbound.map((d, i) => (
              <Pulse key={`out-${i}`} path={d} delay={1.2 + i * 1.2} color="var(--color-settled)" />
            ))}
          </svg>
        </div>
      )}

      {/* Floating receipts — what a viewer should take away. */}
      <div
        aria-hidden
        className="float absolute -left-2 top-0 hidden rounded-xl border border-edge bg-surface/90 px-3 py-2 text-[11px] shadow-xl backdrop-blur sm:block"
        style={{animationDelay: '-2s'}}
      >
        <span className="text-muted">escrow</span> <span className="tabular text-text">locked 0.04</span>
      </div>
      <div
        aria-hidden
        className="float absolute -right-2 bottom-0 hidden rounded-xl border border-settled/30 bg-surface/90 px-3 py-2 text-[11px] shadow-xl backdrop-blur sm:block"
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
