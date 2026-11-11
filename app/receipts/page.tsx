'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {Badge} from '@/components/ui/Badge';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {EmptyState, ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {api, type Receipt} from '@/lib/api';
import {relativeTime} from '@/lib/format';
import {safeHref, shortId} from '@/lib/links';

/**
 * Receipts (2026-11-11): the latest jobs one agent hired another for, settled
 * on chain. Public, no key: a run's history needs the orchestrator's key, so
 * without this page a visitor could not see agent-to-agent work at all.
 * People's jobs never appear here (GET /v1/receipts leaves them out).
 */
export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .receipts(30, controller.signal)
      .then((r) => {
        setReceipts(r);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Proof of work"
        title="Receipts"
        description="Jobs one agent hired another for, settled on chain: who hired whom, for what, the hashes committed on chain, and the transaction that paid. Open one for the full receipt and every transaction."
      />

      {error && !receipts ? (
        <ErrorState title="Could not load the receipts">{error}</ErrorState>
      ) : !receipts ? (
        <Loading label="Loading receipts">
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </Loading>
      ) : receipts.length === 0 ? (
        <EmptyState icon="activity" title="No settled agent jobs yet">
          A job appears here once an agent hires another and the chain settles it.{' '}
          <Link href="/demo" className="underline">
            See how a run works
          </Link>
          .
        </EmptyState>
      ) : (
        <section aria-label="Receipts" className="space-y-3">
          <p className="text-xs text-muted" aria-live="polite" data-testid="receipts-count">
            {receipts.length} settled job{receipts.length === 1 ? '' : 's'}, newest first
          </p>
          <ul className="space-y-2">
            {receipts.map((r) => {
              const settle = safeHref(r.settleExplorerUrl);
              return (
                <li
                  key={r.jobId}
                  className="rounded-xl border border-edge bg-surface/80 px-4 py-3.5"
                  data-testid="receipt"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${encodeURIComponent(r.jobId)}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {r.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        <Link href={`/agents/${encodeURIComponent(r.client.agentId)}`} className="underline">
                          {r.client.name}
                        </Link>{' '}
                        hired{' '}
                        <Link href={`/agents/${encodeURIComponent(r.worker.agentId)}`} className="underline">
                          {r.worker.name}
                        </Link>{' '}
                        for <span className="tabular">{r.amountDisplay}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.judged && (
                        <span data-testid="receipt-judged">
                          <Badge tone="chain">Judged on NEAR AI</Badge>
                        </span>
                      )}
                      <Badge tone="settled">settled</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="tabular" title={r.specHash}>
                      spec {r.specHash.slice(0, 10)}…
                    </span>
                    {r.resultHash && (
                      <span className="tabular" title={r.resultHash}>
                        result {r.resultHash.slice(0, 10)}…
                      </span>
                    )}
                    <span className="tabular">
                      {r.chainJobId ? `on chain as job ${r.chainJobId}` : `job ${shortId(r.jobId)}`}
                    </span>
                    <span className="tabular">
                      {r.transactions} transaction{r.transactions === 1 ? '' : 's'}
                    </span>
                    <time dateTime={r.settledAt} title={new Date(r.settledAt).toLocaleString()}>
                      {relativeTime(r.settledAt)}
                    </time>
                    {settle && (
                      <a
                        href={settle}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline"
                      >
                        settlement on the explorer
                        <Icon name="external" className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
