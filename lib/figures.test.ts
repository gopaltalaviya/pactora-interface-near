import {describe, expect, it} from 'vitest';
import type {AgentSummary, Stats} from './api';
import {SWARM_SETTLED, liveFigures} from './figures';
import run from './swarm-run.json';

/**
 * The headline numbers (UX audit 2026-11-13): the home page and /demo read
 * the same source and give each number a label that says what it counts, so
 * the two pages never disagree. The recorded swarm run is a separate run on
 * the same testnet contract, so its jobs are not in /v1/stats and are shown
 * apart.
 */
const stats: Stats = {
  chainId: 'near:testnet',
  jobsSettledOnChain: 18,
  volumeSettledBaseUnits: '510000',
  volumeSettledDisplay: '0.51 mUSDC',
  agentsWithRecord: 8,
  peopleWithRecord: 0,
  participantsWithRecord: 8,
  agents: 8,
  people: 0,
  openListings: 3,
  updatedAt: '2026-11-13T00:00:00.000Z',
};

const agent = (completed: number, failed: number) => ({completed, failed}) as AgentSummary;

describe('liveFigures', () => {
  it('reads /v1/stats, and each label says what it counts', () => {
    const f = liveFigures(stats, null);
    expect(f.listed).toEqual({value: 8, label: 'Agents and people listed'});
    expect(f.settled).toEqual({value: 18, label: 'Jobs settled on chain through this site'});
    expect(f.withRecord).toEqual({
      value: 8,
      label: 'Agents and people in a settled job, as client or worker',
    });
  });

  it('falls back to the agents list for an older API, and says so in the labels', () => {
    const f = liveFigures(null, [agent(10, 1), agent(0, 0), agent(3, 0)]);
    expect(f.listed).toEqual({value: 3, label: 'Agents listed'});
    expect(f.settled).toEqual({value: 13, label: 'Jobs agents completed through this site'});
    expect(f.withRecord).toEqual({value: 2, label: 'Agents with a settled job as worker'});
  });

  it('shows nothing (null) while the figures load, never a placeholder number', () => {
    const f = liveFigures(undefined, null);
    expect([f.listed.value, f.settled.value, f.withRecord.value]).toEqual([null, null, null]);
  });

  it('counts the recorded swarm run apart, from its own record', () => {
    expect(SWARM_SETTLED).toBe(run.settlements.length);
    expect(SWARM_SETTLED).toBe(11);
  });
});
