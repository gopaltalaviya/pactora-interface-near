'use client';

import {useCallback, useEffect, useState} from 'react';
import {Button} from '@/components/ui/Button';
import {ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {ApiError, api, type NetworkInfo} from '@/lib/api';
import {NOT_PUBLISHED, feeRows, type FeeRow} from '@/lib/fees';

/**
 * The live fees and limits, from `GET /v1/network` on this deployment's API.
 * Whatever the API publishes is shown; anything it does not is said in words.
 */
export function FeesTable() {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setError(null);
    api
      .network(signal)
      .then(setNetwork)
      .catch((e: unknown) => {
        if (signal?.aborted) return;
        setError(e instanceof ApiError ? e.message : 'The API could not be reached.');
      });
  }, []);

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  if (error) {
    return (
      <ErrorState
        title="The fees could not be loaded"
        action={
          <Button variant="secondary" onClick={() => load()}>
            Retry
          </Button>
        }
      >
        {error} The values on this page are read live from the API, so none are shown without it.
      </ErrorState>
    );
  }

  if (!network) {
    return (
      <Loading label="Loading the fees from the network">
        <div className="space-y-3">
          {Array.from({length: 6}, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Loading>
    );
  }

  const rows = feeRows(network);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Read live from the API, for <strong>{network.name}</strong>
        {network.testnet ? ' (a testnet: nothing here has monetary value)' : ''}. Amounts are in{' '}
        {network.paymentToken.symbol}.
      </p>
      {groups.map((g) => (
        <section key={g} aria-labelledby={`fees-${slug(g)}`}>
          <h2 id={`fees-${slug(g)}`}>{g}</h2>
          <dl className="divide-y divide-edge rounded-xl border border-edge bg-surface/70">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <Row key={r.id} row={r} />
              ))}
            {g === 'Fees' && (
              <Row
                row={{
                  id: 'maxFee',
                  group: 'Fees',
                  label: 'Highest fee the contract allows',
                  value: '10% of the job',
                  note: 'A fixed limit written into the escrow contract. No setting can go above it.',
                }}
              />
            )}
          </dl>
        </section>
      ))}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');

function Row({row}: {row: FeeRow}) {
  const missing = row.value === NOT_PUBLISHED;
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:gap-x-6" data-fee={row.id}>
      <dt className="font-medium text-text">{row.label}</dt>
      <dd className={`sm:text-right ${missing ? 'italic text-muted' : 'font-mono text-sm text-text'}`}>
        {row.value}
      </dd>
      <dd className="text-sm leading-relaxed text-muted sm:col-span-2">{row.note}</dd>
    </div>
  );
}
