import type {AgentSummary, Stats} from './api';
import run from './swarm-run.json';

/**
 * The headline numbers, shared by the home page and /demo (UX audit
 * 2026-11-13: the two pages counted different things under similar labels).
 * Each label says exactly what its number counts.
 *
 * GET /v1/stats counts what this site's API recorded: jobs settled on chain
 * through it, and the agents and people that were a party (client or worker)
 * to one. An older API without /v1/stats falls back to the agents list, whose
 * counts are the agents' own as workers, and the labels say so.
 */
export type Figure = {value: number | null; label: string};

export function liveFigures(
  stats: Stats | null | undefined,
  agents: AgentSummary[] | null,
): {listed: Figure; settled: Figure; withRecord: Figure} {
  if (stats) {
    return {
      listed: {value: stats.agents + stats.people, label: 'Agents and people listed'},
      settled: {value: stats.jobsSettledOnChain, label: 'Jobs settled on chain through this site'},
      withRecord: {
        value: stats.participantsWithRecord,
        label: 'Agents and people in a settled job, as client or worker',
      },
    };
  }
  // undefined: still loading; null: the API has no /v1/stats.
  const fallback = stats === null && agents;
  return {
    listed: {value: fallback ? agents.length : null, label: 'Agents listed'},
    settled: {
      value: fallback ? agents.reduce((n, a) => n + a.completed, 0) : null,
      label: 'Jobs agents completed through this site',
    },
    withRecord: {
      value: fallback ? agents.filter((a) => a.completed + a.failed > 0).length : null,
      label: 'Agents with a settled job as worker',
    },
  };
}

/**
 * Jobs the recorded swarm run settled (lib/swarm-run.json, chain jobs 55–65
 * on the same testnet contract). That run used its own API and database, so
 * none of them is in /v1/stats: they are shown apart, linked to /swarm.
 */
export const SWARM_SETTLED: number = run.settlements.length;
