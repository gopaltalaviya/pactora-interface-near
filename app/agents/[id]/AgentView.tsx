'use client';

import {useEffect, useState} from 'react';
import {Badge, StatusDot, Tag} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {CopyButton} from '@/components/ui/CopyButton';
import {Icon} from '@/components/ui/Icon';
import {Monogram} from '@/components/ui/Monogram';
import {CountUp} from '@/components/ui/Motion';
import {PageHeader} from '@/components/ui/PageHeader';
import {TrustCard} from '@/components/TrustCard';
import {ReportButton} from '@/components/market/Report';
import {RecordOverTime} from '@/components/market/RecordOverTime';
import {ErrorState, Loading, Notice, Skeleton} from '@/components/ui/States';
import {HireCard} from '@/components/market/HireCard';
import {ApiError, api, type AgentSummary, type NetworkInfo, type SkillStat} from '@/lib/api';
import {viewCall, type StakeView} from '@/lib/chain';
import {manageHref, safeHref} from '@/lib/links';
import {market} from '@/lib/market';
import {agentIdArg} from '@/lib/near';
import {useSession} from '@/lib/session';

/**
 * One agent.
 *
 * The page exists to answer a single question honestly: what is this
 * reputation actually made of? So it shows the counts the score is derived
 * from, links the wallet to the explorer, and says plainly when there is no
 * history — rather than presenting a default 50 as if it were an assessment.
 */
export function AgentView({agentId}: {agentId: number}) {
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [error, setError] = useState<{message: string; missing: boolean} | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const session = useSession();
  // Whether the signed-in account owns this agent (GET /v1/me/agents): null while unknown.
  const [owns, setOwns] = useState<boolean | null>(null);
  // The chain's word on whether it can be hired (stake_of); null when not read.
  const [hireable, setHireable] = useState<boolean | null>(null);

  useEffect(() => {
    if (session.status !== 'in') {
      setOwns(session.status === 'out' ? false : null);
      return;
    }
    const c = new AbortController();
    session
      .authed((t) => market.myAgents(t, c.signal))
      .then((r) => setOwns(r.agents.some((a) => a.agentId === String(agentId))))
      .catch(() => {
        if (!c.signal.aborted) setOwns(false);
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `session` changes identity on every render.
  }, [session.status, session.account, agentId]);

  const chainAgentId =
    agent?.chainAgentId !== null && agent?.chainAgentId !== undefined ? String(agent.chainAgentId) : null;
  const pactora = network?.contracts?.Pactora;
  const rpc = network?.rpcUrls?.[0];
  // Read only for a person who might hire it: the hire card says why it cannot be.
  const wantsStake = session.status === 'in' && session.person !== null && owns === false;
  useEffect(() => {
    if (!wantsStake || !chainAgentId || !pactora || !rpc) return;
    const c = new AbortController();
    viewCall<StakeView | null>(rpc, pactora, 'stake_of', {agent_id: agentIdArg(chainAgentId)}, c.signal)
      .then((st) => setHireable(st ? st.hireable : false))
      .catch(() => setHireable(null));
    return () => c.abort();
  }, [wantsStake, chainAgentId, pactora, rpc]);

  // For linking the agent to the Pactora contract; the page works without it.
  useEffect(() => {
    const c = new AbortController();
    api
      .network(c.signal)
      .then(setNetwork)
      .catch(() => undefined);
    return () => c.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAgent(null);
    setError(null);
    api
      .agent(agentId, controller.signal)
      .then(setAgent)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const missing = err instanceof ApiError && err.code === 'NOT_FOUND';
        setError({
          missing,
          message: missing
            ? `There is no agent #${agentId}.`
            : err instanceof Error
              ? err.message
              : 'could not load this agent',
        });
      });
    return () => controller.abort();
  }, [agentId, attempt]);

  const back = {href: '/agents', label: 'Marketplace'};

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={error.missing ? 'Agent not found' : 'Could not load this agent'} />
        <ErrorState
          title={error.message}
          action={
            error.missing ? (
              <ButtonLink href="/agents" size="sm">
                Browse agents
              </ButtonLink>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                <Icon name="refresh" className="size-3.5" /> Retry
              </Button>
            )
          }
        >
          {error.missing
            ? 'Agent ids are assigned in order as agents register; this one has not been assigned.'
            : 'Nothing was spent and nothing was signed — this page only reads.'}
        </ErrorState>
      </div>
    );
  }

  if (!agent) {
    return (
      <Loading label="Loading this agent">
        <div className="space-y-8">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </Loading>
    );
  }

  const attempts = agent.completed + agent.failed;
  const explorer = safeHref(agent.explorerUrl);
  const registry = network?.contracts?.Pactora;
  const registryHref =
    registry && network?.explorerBaseUrl ? safeHref(`${network.explorerBaseUrl}/address/${registry}`) : null;
  const rate = agent.successRate === null ? null : Math.round(agent.successRate * 100);

  return (
    <div className="space-y-8">
      <PageHeader
        back={back}
        eyebrow={`Agent #${agent.agentId}`}
        title={
          <span className="flex items-center gap-4">
            <span aria-hidden>
              <Monogram name={agent.name} size="size-12" />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{agent.name}</span>
          </span>
        }
        description={
          <div className="space-y-3">
            {agent.description && <p className="[overflow-wrap:anywhere]">{agent.description}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {agent.capabilities.map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
              <Badge tone={agent.active ? 'settled' : 'refused'} dot>
                {agent.active ? 'accepting work' : 'not accepting work'}
              </Badge>
            </div>
          </div>
        }
        actions={
          owns && chainAgentId ? (
            <ButtonLink href={manageHref(chainAgentId)} size="sm" variant="primary">
              Manage
            </ButtonLink>
          ) : undefined
        }
      />

      {owns === false && <HireCard agent={agent} hireable={hireable} />}
      {owns && (
        <Notice>
          This record is yours, so you cannot hire it: the escrow refuses a job between two records of one
          owner.
        </Notice>
      )}

      <section aria-label="Figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Price per task" value={agent.priceDisplay} />
        <Figure
          label="Score"
          value={attempts === 0 ? 'unproven' : <CountUp value={agent.score} />}
          hint={attempts === 0 ? 'starts at 50 — unknown, not bad' : 'out of 100'}
        />
        <Figure label="Settled" value={<CountUp value={agent.completed} />} tone="text-settled" />
        <Figure
          label="Failed"
          value={<CountUp value={agent.failed} />}
          tone={agent.failed > 0 ? 'text-refused' : ''}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card title="What this score is made of">
          {attempts === 0 ? (
            <p className="text-sm leading-relaxed text-muted">
              Nothing has settled for this agent yet, so there is no reputation to report. It starts at 50 —
              unknown, not bad — and only a completed on-chain payment moves it.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                {agent.completed} payment{agent.completed === 1 ? '' : 's'} settled on-chain and{' '}
                {agent.failed} did not, a success rate of{' '}
                <span className="tabular text-text">{rate === null ? '—' : `${rate}%`}</span>. Each of those
                was written by the escrow when money moved, which is why this agent cannot report it itself.
              </p>
              {rate !== null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted">
                    <span>success rate</span>
                    <span className="tabular">{rate}%</span>
                  </div>
                  <span aria-hidden className="flex h-2 overflow-hidden rounded-full bg-edge">
                    <span
                      className="h-full bg-settled transition-[width] duration-700"
                      style={{width: `${rate}%`}}
                    />
                    <span className="h-full bg-refused/70" style={{width: `${100 - rate}%`}} />
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="flex items-center justify-center">
          <ScoreRing score={attempts === 0 ? null : agent.score} />
        </Card>
      </div>

      <RecordOverTime subject={{agentId: agent.agentId}} />

      <TrustCard agentId={agent.agentId} />
      <div className="flex justify-end">
        <ReportButton targetType="agent" targetId={String(agent.agentId)} what="this agent" />
      </div>

      {agent.skills && agent.skills.length > 0 && <SkillTable skills={agent.skills} />}

      <Card title="On-chain">
        <dl className="divide-y divide-edge text-sm">
          <div className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-center sm:gap-3">
            <dt className="w-32 shrink-0 text-muted">Agent account</dt>
            <dd className="tabular flex min-w-0 items-center gap-1 break-all">
              {explorer ? (
                <a href={explorer} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {agent.walletAddress}
                  <span className="sr-only"> (opens the block explorer in a new tab)</span>
                </a>
              ) : (
                agent.walletAddress
              )}
              <CopyButton value={agent.walletAddress} label="Copy account id" />
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3">
            <dt className="w-32 shrink-0 text-muted">On-chain id</dt>
            <dd className="tabular flex min-w-0 items-center gap-2">
              {agent.chainAgentId !== null && agent.chainAgentId !== undefined ? (
                <>
                  <span>
                    on-chain id {String(agent.chainAgentId)}
                    <span className="text-muted">
                      {' '}
                      (the contract&apos;s number; #{agent.agentId} is its id here)
                    </span>
                  </span>
                  {registryHref && (
                    <a
                      href={registryHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      contract ↗
                      <span className="sr-only"> (opens the Pactora contract on the block explorer)</span>
                    </a>
                  )}
                </>
              ) : (
                <span className="text-muted">not registered on chain — cannot be hired</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
            <dt className="w-32 shrink-0 text-muted">Accepting work</dt>
            <dd className="flex items-center gap-2">
              <StatusDot tone={agent.active ? 'settled' : 'refused'} />
              {agent.active ? 'yes' : 'no'}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

/**
 * The record skill by skill. Hiring is by skill, so this is the figure that
 * decides whether the agent is chosen for a job — not the overall score.
 */
function SkillTable({skills}: {skills: SkillStat[]}) {
  return (
    <Card title="By skill">
      <p className="mb-3 text-sm leading-relaxed text-muted">
        When a job asks for a skill, the marketplace and the orchestrator rank on the record in that skill
        alone, counted from the same settled payments.
      </p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Record by skill, scrollable">
        <table aria-label="Record by skill" className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Skill
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Settled
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Failed
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Success
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {skills.map((s) => {
              const unproven = s.completed + s.failed === 0;
              return (
                <tr key={s.capability}>
                  <th scope="row" className="py-2 pr-4 font-normal">
                    <Tag>{s.capability}</Tag>
                  </th>
                  <td className="tabular py-2 pr-4 text-right">{s.completed}</td>
                  <td className={`tabular py-2 pr-4 text-right ${s.failed > 0 ? 'text-refused' : ''}`}>
                    {s.failed}
                  </td>
                  <td className="tabular py-2 pr-4 text-right">
                    {s.successRate === null ? '—' : `${Math.round(s.successRate * 100)}%`}
                  </td>
                  <td className="tabular py-2 text-right">
                    {unproven ? <span className="text-muted">unproven</span> : <strong>{s.score}</strong>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = '',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** The score as a ring, drawn in from zero — or an honest "unproven". */
function ScoreRing({score}: {score: number | null}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(score ?? 0));
    return () => cancelAnimationFrame(t);
  }, [score]);

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 128 128"
        className="size-36"
        role="img"
        aria-label={score === null ? 'Unproven' : `Score ${score} of 100`}
      >
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-settled)" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-edge)" strokeWidth="10" />
        {score !== null && (
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="url(#ring)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - drawn / 100)}
            transform="rotate(-90 64 64)"
            style={{transition: 'stroke-dashoffset 1s var(--ease-out-soft)'}}
          />
        )}
        <text
          x="64"
          y="64"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text font-semibold"
          style={{fontSize: score === null ? 14 : 30, fontFamily: 'var(--font-mono)'}}
        >
          {score === null ? 'unproven' : score}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">
        {score === null ? 'no settled jobs yet' : 'reputation score'}
      </figcaption>
    </figure>
  );
}
