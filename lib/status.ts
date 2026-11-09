import type {StatusReport} from './api';

/**
 * An indexer that has stopped for good, as `GET /v1/status` reports it
 * (Round 3, 2026-11-09): its start block was garbage-collected by a
 * non-archival RPC, so it can never read forward from where it is. The API
 * says `indexer.state: "stalled: start block pruned"` with the operator's
 * fix. This is not "catching up" and not a restart away, so /status says so
 * in words.
 */
export interface StalledIndexer {
  chain: string;
  state: string;
  /** The start block is gone from the RPC. */
  pruned: boolean;
  fix: string | null;
}

export function stalledIndexers(report: Pick<StatusReport, 'chains'>): StalledIndexer[] {
  return report.chains.flatMap((c) => {
    const state = c.indexer.state ?? (c.indexer.status === 'stalled' ? 'stalled' : null);
    if (!state?.startsWith('stalled')) return [];
    return [{chain: c.name, state, pruned: state.includes('pruned'), fix: c.indexer.fix ?? null}];
  });
}
