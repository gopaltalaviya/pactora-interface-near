'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Skeleton} from '@/components/ui/States';
import {useLandOn} from '@/components/ui/useLandOn';
import type {NetworkInfo} from '@/lib/api';
import {
  moneyLines,
  openJobsMoney,
  readRecord,
  readWallet,
  type LineStatus,
  type MoneyLine,
  type OpenJobsMoney,
  type Settled,
  type WalletMoney,
} from '@/lib/balances';
import {rpcOf, type AgentOnChain} from '@/lib/chain';
import {market} from '@/lib/market';
import {useSession} from '@/lib/session';

/**
 * "Your money" (2026-11-12): the wallet, the Pactora record and the open
 * jobs, each line with its meaning and the next step when it is low. The
 * same panel on /me, on an agent's manage page, and compact beside a form
 * that spends.
 */

export interface MoneyState {
  /** Nothing has answered yet. */
  loading: boolean;
  wallet: WalletMoney | null;
  record: Settled<AgentOnChain> | null;
  jobs: Settled<OpenJobsMoney> | null;
  reload: () => void;
}

const failure = (err: unknown) => (err instanceof Error ? err.message : 'could not be read');

/**
 * Reads what the panel shows. `account` is the wallet to read (null: none);
 * `chainAgentId` the Pactora record (null: none); `jobs` whether to sum the
 * signed-in person's open jobs. Every read runs side by side and fails alone.
 */
export function useMoney(
  network: NetworkInfo | null,
  opts: {account: string | null; chainAgentId: string | null; jobs?: boolean; record?: boolean},
): MoneyState {
  const {authed, status} = useSession();
  const [attempt, setAttempt] = useState(0);
  const [wallet, setWallet] = useState<WalletMoney | null>(null);
  const [record, setRecord] = useState<Settled<AgentOnChain> | null>(null);
  const [jobs, setJobs] = useState<Settled<OpenJobsMoney> | null>(null);
  const rpc = network ? rpcOf(network) : null;
  const tokenId = network?.paymentToken.accountId ?? null;
  const pactora = network?.contracts?.Pactora ?? null;
  const {account, chainAgentId} = opts;
  const wantRecord = opts.record !== false;
  const wantJobs = opts.jobs === true && status === 'in';

  useEffect(() => {
    if (!rpc || !account) return;
    const c = new AbortController();
    setWallet(null);
    readWallet(rpc, account, tokenId, c.signal)
      .then(setWallet)
      .catch(() => undefined);
    return () => c.abort();
  }, [rpc, account, tokenId, attempt]);

  useEffect(() => {
    if (!rpc || !pactora || !chainAgentId || !wantRecord) return;
    const c = new AbortController();
    setRecord(null);
    readRecord(rpc, pactora, chainAgentId, c.signal)
      .then(setRecord)
      .catch(() => undefined);
    return () => c.abort();
  }, [rpc, pactora, chainAgentId, wantRecord, attempt]);

  useEffect(() => {
    if (!wantJobs || !network) return;
    const c = new AbortController();
    setJobs(null);
    authed((t) => market.jobs(t, {status: 'open', limit: 100}, c.signal))
      .then((page) => setJobs({ok: true, value: openJobsMoney(page.jobs, network, page.nextCursor !== null)}))
      .catch((err: unknown) => {
        if (!c.signal.aborted) setJobs({ok: false, error: failure(err)});
      });
    return () => c.abort();
  }, [wantJobs, network, authed, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const waiting =
    !network ||
    (Boolean(account && rpc) && wallet === null) ||
    (Boolean(chainAgentId && rpc && pactora && wantRecord) && record === null) ||
    (wantJobs && jobs === null);
  return {loading: waiting, wallet, record, jobs, reload};
}

const TONE: Record<LineStatus, 'settled' | 'refused' | 'broken'> = {
  ok: 'settled',
  low: 'refused',
  missing: 'refused',
  error: 'broken',
};
const WORD: Record<LineStatus, string> = {ok: 'OK', low: 'Low', missing: 'Missing', error: 'Unread'};

function Line({line, compact}: {line: MoneyLine; compact: boolean}) {
  const external = line.next ? /^https?:/.test(line.next.href) : false;
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 ${compact ? 'py-2' : 'py-3'} first:pt-0 last:pb-0`}
      data-testid={`money-${line.id}`}
      data-status={line.status}
    >
      <dt className="text-sm font-medium">{line.label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 text-right">
        <span className="tabular text-sm">{line.value}</span>
        {line.status !== 'ok' && <Badge tone={TONE[line.status]}>{WORD[line.status]}</Badge>}
      </dd>
      {!compact && <dd className="col-span-2 text-xs leading-relaxed text-muted">{line.meaning}</dd>}
      {line.advice && (
        <dd
          className={`col-span-2 text-xs leading-relaxed ${line.status === 'error' ? 'text-broken' : 'text-refused'}`}
          data-testid={`money-${line.id}-advice`}
        >
          {line.advice}
          {line.next && (
            <>
              {' '}
              {external ? (
                <a href={line.next.href} target="_blank" rel="noopener noreferrer" className="underline">
                  {line.next.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link href={line.next.href} className="underline">
                  {line.next.label}
                </Link>
              )}
              .
            </>
          )}
        </dd>
      )}
    </div>
  );
}

/**
 * The lines, laid out. `only` keeps the lines a form needs (by id), in the
 * panel's order; `compact` drops the meanings and the card chrome.
 */
export function MoneyPanel({
  network,
  money,
  account,
  chainAgentId,
  compact = false,
  only,
  title = 'Your money',
  description = 'Where your money is, read from the chain and the API just now, and what each part is for.',
  id = 'money',
}: {
  network: NetworkInfo | null;
  money: MoneyState;
  account: string | null;
  chainAgentId: string | null;
  compact?: boolean;
  only?: string[];
  title?: string;
  description?: string;
  id?: string;
}) {
  // Arrived from a link to #money (an error's next step): bring the panel into view once it has lines.
  useLandOn(id, !money.loading && !compact);

  const all = network
    ? moneyLines({
        network,
        account,
        chainAgentId,
        wallet: money.wallet,
        record: money.record,
        jobs: money.jobs,
      })
    : [];
  const lines = only ? all.filter((l) => only.includes(l.id)) : all;
  const attention = lines.filter((l) => l.status !== 'ok').length;

  const body = (
    <div aria-live="polite" aria-busy={money.loading || undefined}>
      {money.loading && lines.length === 0 ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">Reading your balances</span>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing to show yet: sign in, and register on chain to have a purse.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-edge">
            {lines.map((l) => (
              <Line key={l.id} line={l} compact={compact} />
            ))}
          </dl>
          {money.loading && <p className="mt-2 text-xs text-muted">Still reading the rest…</p>}
        </>
      )}
    </div>
  );

  const refresh = (
    <Button size="sm" variant="ghost" onClick={money.reload} disabled={money.loading}>
      Refresh
    </Button>
  );

  if (compact) {
    return (
      <section
        aria-labelledby={id}
        className="rounded-xl border border-edge bg-ink/40 p-3 text-sm"
        data-testid="money-panel"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 id={id} className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            {title}
            {attention > 0 && <span className="sr-only">, {attention} need attention</span>}
          </h3>
          {refresh}
        </div>
        {body}
      </section>
    );
  }
  return (
    <div data-testid="money-panel">
      <Card title={title} description={description} labelledBy={id} actions={refresh}>
        {body}
      </Card>
    </div>
  );
}
