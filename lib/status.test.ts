import {describe, expect, it} from 'vitest';
import {stalledIndexers} from './status';
import type {StatusReport} from './api';

const chain = (indexer: Partial<StatusReport['chains'][number]['indexer']>) => ({
  chainId: 'near:testnet' as const,
  name: 'NEAR Testnet',
  testnet: true,
  rpc: 'up' as const,
  headBlock: 100,
  indexer: {
    status: 'up' as const,
    indexedBlock: 90,
    lagBlocks: 10,
    lastIndexedAt: null,
    secondsSinceIndexed: null,
    ...indexer,
  },
});

describe('a stalled indexer on /v1/status', () => {
  it('is named, with the fix the API gives, when its start block was pruned', () => {
    const stalled = stalledIndexers({
      chains: [
        chain({
          status: 'stalled',
          state: 'stalled: start block pruned',
          fix: 'set INDEXER_START_AT_HEAD=1 or use an archival RPC',
        }),
      ],
    });
    expect(stalled).toEqual([
      {
        chain: 'NEAR Testnet',
        state: 'stalled: start block pruned',
        pruned: true,
        fix: 'set INDEXER_START_AT_HEAD=1 or use an archival RPC',
      },
    ]);
  });

  it('is nothing to report for a running or merely slow indexer, or an older API', () => {
    expect(stalledIndexers({chains: [chain({})]})).toEqual([]);
    expect(stalledIndexers({chains: [chain({status: 'down', state: 'running'})]})).toEqual([]);
  });

  it('is reported from the state alone when an API sets no status word for it', () => {
    const [s] = stalledIndexers({chains: [chain({status: 'down', state: 'stalled: rpc refused'})]});
    expect(s).toMatchObject({pruned: false, fix: null});
  });
});
