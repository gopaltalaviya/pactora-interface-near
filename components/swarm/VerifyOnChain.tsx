'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/Button';
import {TESTNET_RPC, viewCall} from '@/lib/chain';

/**
 * "Verify on chain": the browser asks a public NEAR RPC node for each job the
 * swarm settled, with no Pactora server in between, and compares the state,
 * the amount and the result hash with what the page shows.
 */
export {TESTNET_RPC};

export interface Expected {
  chainJobId: string;
  amount: string;
  resultHash: string | null;
}

interface ChainJob {
  state: string;
  amount: string;
  result_hash: string | null;
}

export type Check = {chainJobId: string; ok: true} | {chainJobId: string; ok: false; why: string};

/** Compares one job as the page recorded it with the job the contract returned. */
export function compareJob(want: Expected, got: ChainJob | null): Check {
  const id = want.chainJobId;
  if (!got) return {chainJobId: id, ok: false, why: 'the contract has no such job'};
  if (got.state !== 'Settled') return {chainJobId: id, ok: false, why: `state is ${got.state}`};
  if (got.amount !== want.amount) return {chainJobId: id, ok: false, why: `amount is ${got.amount}`};
  if (want.resultHash && got.result_hash !== want.resultHash)
    return {chainJobId: id, ok: false, why: 'the result hash differs'};
  return {chainJobId: id, ok: true};
}

/** The parts of a `GET /v1/receipts` entry a chain check needs. */
interface ReceiptLike {
  chainJobId: string | null;
  chainId: string;
  path: 'escrow' | 'direct';
  amount: string;
  resultHash: string | null;
}

/**
 * The receipts of one network that name a chain job, as jobs to check. A
 * direct payment's job settles in one call with no result on chain (the
 * delivery is recorded off-chain), so only its state and amount are compared.
 */
export function receiptJobs(receipts: ReceiptLike[], chainId: string): Expected[] {
  return receipts.flatMap((r) =>
    r.chainJobId && r.chainId === chainId
      ? [{chainJobId: r.chainJobId, amount: r.amount, resultHash: r.path === 'direct' ? null : r.resultHash}]
      : [],
  );
}

/** Testnet is read through the public node /swarm uses; another network through its first RPC URL. */
export function rpcFor(network: {nearNetworkId: string; rpcUrls: string[]}): string | null {
  return network.nearNetworkId === 'testnet' ? TESTNET_RPC : (network.rpcUrls[0] ?? null);
}

type Status =
  {kind: 'idle'} | {kind: 'busy'} | {kind: 'done'; checks: Check[]} | {kind: 'error'; message: string};

export function VerifyOnChain({
  contract,
  jobs,
  rpcUrl = TESTNET_RPC,
}: {
  contract: string;
  jobs: Expected[];
  rpcUrl?: string;
}) {
  const [status, setStatus] = useState<Status>({kind: 'idle'});

  async function verify() {
    setStatus({kind: 'busy'});
    try {
      const checks = await Promise.all(
        jobs.map(async (j) => {
          if (!/^\d{1,15}$/.test(j.chainJobId))
            return {chainJobId: j.chainJobId, ok: false, why: 'not a job id'} as Check;
          const got = await viewCall<ChainJob | null>(rpcUrl, contract, 'get_job', {
            job_id: Number(j.chainJobId),
          });
          return compareJob(j, got);
        }),
      );
      setStatus({kind: 'done', checks});
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'The chain could not be read.',
      });
    }
  }

  const passed = status.kind === 'done' ? status.checks.filter((c) => c.ok).length : 0;
  return (
    <div className="space-y-2" data-testid="swarm-verify">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={verify}
          loading={status.kind === 'busy'}
          disabled={status.kind === 'busy'}
        >
          Verify on chain
        </Button>
        <span className="text-xs text-muted">
          Your browser reads each job from <code>{contract}</code> through a public NEAR RPC node, not from
          Pactora.
        </span>
      </div>
      <div aria-live="polite" className="text-sm">
        {status.kind === 'done' && (
          <>
            <p
              data-testid="swarm-verify-result"
              className={passed === status.checks.length ? 'text-settled' : 'text-refused'}
            >
              {passed} of {status.checks.length} jobs read from the chain: Settled, with the same amount and
              result hash.
            </p>
            {status.checks.some((c) => !c.ok) && (
              <ul className="text-xs text-refused">
                {status.checks.map((c) =>
                  c.ok ? null : (
                    <li key={c.chainJobId}>
                      chain job {c.chainJobId}: {c.why}
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
        {status.kind === 'error' && (
          <p data-testid="swarm-verify-result" className="text-refused">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
