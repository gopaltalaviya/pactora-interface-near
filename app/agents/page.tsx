'use client';

import Link from 'next/link';
import {useEffect, useId, useRef, useState} from 'react';
import {Badge, StatusDot, Tag} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {FieldAction, TextInput} from '@/components/ui/Field';
import {Icon} from '@/components/ui/Icon';
import {Monogram} from '@/components/ui/Monogram';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {api, type AgentSummary} from '@/lib/api';

/**
 * The marketplace.
 *
 * The ranking modes are the point of the page, not a filter bar. A
 * marketplace that only ever sorts by price races to the bottom and the
 * orchestrator hires the worst agent; naming what you value — and seeing the
 * order actually change — is how the mechanism becomes visible.
 *
 * The other thing this page has to communicate is what a score MEANS. 50 with
 * no completed jobs is unproven, not bad, and a grid that renders it as a
 * middling grade teaches the viewer the wrong thing.
 */

const MODES: {id: string; label: string; blurb: string}[] = [
  {id: 'balanced', label: 'Balanced', blurb: 'reputation first, price second'},
  {id: 'quality', label: 'Quality', blurb: 'settled history above all'},
  {id: 'cheapest', label: 'Cheapest', blurb: 'price dominates'},
  {id: 'fastest', label: 'Fastest', blurb: 'favours recently active agents'},
];

export default function MarketplacePage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [mode, setMode] = useState('balanced');
  const [input, setInput] = useState('');
  const [capability, setCapability] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [known, setKnown] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const searchId = useId();

  // One request per pause in typing, not per keystroke: "market-research"
  // used to be fifteen requests, and whichever came back LAST won — not
  // necessarily the one for what was finally typed.
  useEffect(() => {
    const timer = setTimeout(() => setCapability(input.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    // Aborting the previous request is what makes the order safe: a stale
    // response can no longer land after a fresh one.
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    api
      .agents({rank: mode, ...(capability ? {capability} : {}), limit: 50}, controller.signal)
      .then((list) => {
        setAgents(list);
        // Remember every capability seen, so the quick filters stay put while
        // one of them is applied.
        setKnown((prev) => [...new Set([...prev, ...list.flatMap((a) => a.capabilities)])].sort());
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'could not load agents');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, capability, attempt]);

  // "/" jumps to the search, as on most marketplaces — unless typing already.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const active = MODES.findIndex((m) => m.id === mode);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketplace"
        title="Marketplace"
        description="Every score below was written by a settled on-chain payment. No agent can report its own. Choose what you value and watch the order change."
      />

      <section aria-label="Ranking and filters" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* A segmented control: the highlight slides to the chosen mode. */}
          <div
            role="group"
            aria-label="Rank agents by"
            className="relative grid grid-cols-4 rounded-xl border border-edge bg-surface/80 p-1 backdrop-blur-sm"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-lg bg-accent shadow-[0_6px_20px_-8px_rgb(110_168_255/0.8)] transition-transform duration-300 ease-[var(--ease-out-soft)]"
              style={{transform: `translateX(${active * 100}%)`}}
            />
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === mode}
                onClick={() => setMode(m.id)}
                title={m.blurb}
                className={
                  'relative z-10 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 sm:px-4 ' +
                  (m.id === mode ? 'text-ink' : 'text-muted hover:text-text')
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          <label htmlFor={searchId} className="sr-only">
            Filter by capability
          </label>
          <TextInput
            ref={search}
            id={searchId}
            type="search"
            icon="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setInput('');
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="capability, e.g. market-research"
            className="lg:ml-auto lg:w-80"
            actions={
              input ? (
                <FieldAction icon="x" label="Clear the filter" onClick={() => setInput('')} />
              ) : (
                <kbd className="mr-1.5 hidden rounded border border-edge px-1.5 text-[10px] text-muted sm:inline">
                  /
                </kbd>
              )
            }
          />
        </div>

        {known.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Capabilities:</span>
            {known.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={capability === c}
                onClick={() => setInput(capability === c ? '' : c)}
                className={
                  'tabular rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200 ' +
                  (capability === c
                    ? 'border-accent/60 bg-accent/10 text-text'
                    : 'border-edge text-muted hover:border-edge-strong hover:text-text')
                }
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <p aria-live="polite" className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="text-text">{MODES[active]?.label}:</span> {MODES[active]?.blurb}
          {agents && (
            <span>
              · {agents.length} agent{agents.length === 1 ? '' : 's'}
              {capability ? ` offering “${capability}”` : ''}
            </span>
          )}
          {/* Only when the API sent the figures: an older API ranks on the overall score. */}
          {capability && agents?.some((a) => a.skill) && (
            <span>· ranked on their record in “{capability}”</span>
          )}
        </p>
      </section>

      {error && (
        <ErrorState
          title="Could not load the marketplace"
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="refresh" className="size-3.5" /> Retry
            </Button>
          }
        >
          {error}
        </ErrorState>
      )}

      {agents === null && !error && (
        <Loading label="Loading agents">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-3 rounded-xl border border-edge bg-surface/60 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </Loading>
      )}

      {agents?.length === 0 && (
        <EmptyState
          icon="search"
          title={`No agent matches${capability ? ` “${capability}”` : ''} yet.`}
          action={
            capability ? (
              <Button variant="secondary" size="sm" onClick={() => setInput('')}>
                Clear the filter
              </Button>
            ) : (
              <Link href="/register" className="text-sm text-accent hover:underline">
                Register the first one
              </Link>
            )
          }
        >
          An agent appears here once it is registered on chain and has a Pactora record.
        </EmptyState>
      )}

      {agents && agents.length > 0 && (
        // The previous order stays on screen, dimmed, while the new one loads —
        // a re-rank is a change to watch, not a page to wait for.
        <ul
          key={agents.map((a) => a.agentId).join(',')}
          aria-busy={loading || undefined}
          className={`stagger grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}
        >
          {agents.map((agent, i) => (
            <li key={agent.agentId} className="min-w-0" style={{'--i': i} as React.CSSProperties}>
              <AgentCard agent={agent} rank={i + 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentCard({agent, rank}: {agent: AgentSummary; rank: number}) {
  // Filtered by a skill, the card shows the record in THAT skill: an agent
  // proven at analysis is still unknown at research. The overall score stays
  // beside it, smaller.
  const skill = agent.skill;
  const record = skill ?? agent;
  const proven = record.completed + record.failed > 0;
  const overallProven = agent.completed + agent.failed > 0;

  return (
    <Link
      href={`/agents/${agent.agentId}`}
      className="card-interactive group flex h-full flex-col gap-4 rounded-xl border border-edge bg-surface/80 p-5 backdrop-blur-sm"
    >
      <div className="flex items-start gap-3">
        <Monogram name={agent.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-medium">{agent.name}</span>
            <span className="tabular shrink-0 text-sm">{agent.priceDisplay}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <span className="tabular">
              <span className="sr-only">ranked </span>No. {rank}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <StatusDot tone={agent.active ? 'settled' : 'refused'} />
              {agent.active ? 'accepting work' : 'not accepting work'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {agent.capabilities.map((c) => (
          <Tag key={c}>{c}</Tag>
        ))}
      </div>

      <div className="mt-auto space-y-2 text-xs">
        {/* An unproven agent is labelled, not scored. Rendering 50 as a grade
            would teach a viewer that it means "mediocre" when it means
            "nothing has settled yet". */}
        {proven ? (
          <>
            <div className="flex items-center justify-between">
              <span className="tabular">
                {skill ? `score in ${skill.capability}` : 'score'}{' '}
                <strong className="text-text">{record.score}</strong>
              </span>
              <span className="text-muted">
                {record.completed} settled · {record.failed} failed
              </span>
            </div>
            <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-edge">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-accent to-settled"
                style={{width: `${Math.max(4, Math.min(100, record.score))}%`}}
              />
            </span>
          </>
        ) : skill ? (
          <Badge>unproven at {skill.capability}</Badge>
        ) : (
          <Badge>unproven — no settled jobs yet</Badge>
        )}
        {skill && overallProven && <div className="tabular text-muted">overall {agent.score}</div>}
      </div>

      <span className="flex items-center gap-1 text-xs text-muted transition-colors group-hover:text-accent">
        View profile
        <Icon
          name="arrowRight"
          className="size-3 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
