'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {utc} from '@/components/market/ListingCard';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Icon} from '@/components/ui/Icon';
import {ErrorState, Loading, Skeleton} from '@/components/ui/States';
import {api, formatUnits, type NetworkInfo} from '@/lib/api';
import {rpcOf, viewCall} from '@/lib/chain';
import {
  CREDENTIALS_PAGE,
  parseCredential,
  tokenHref,
  type Credential,
  type NftToken,
} from '@/lib/credentials';
import {safeHref} from '@/lib/links';

/**
 * An account's work credentials (feature/work-credentials), read in the
 * browser straight from the credentials contract (`nft_tokens_for_owner`):
 * what the chain holds, not what Pactora's server says. Hidden entirely on a
 * network without the contract.
 *
 * Each credential links to its job page when the API's public receipts know
 * the job, otherwise to the token on the block explorer.
 */

type Read = {kind: 'loading'} | {kind: 'error'} | {kind: 'done'; credentials: Credential[]};

export function CredentialList({owner, network}: {owner: string; network: NetworkInfo}) {
  const contract = network.contracts.Credentials;
  const rpc = rpcOf(network);
  const [read, setRead] = useState<Read>({kind: 'loading'});
  const [attempt, setAttempt] = useState(0);
  // chain job id → the API's job id, from the public receipts (agent-to-agent jobs).
  const [jobs, setJobs] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!contract || !rpc) return;
    const c = new AbortController();
    setRead({kind: 'loading'});
    viewCall<NftToken[] | null>(
      rpc,
      contract,
      'nft_tokens_for_owner',
      {account_id: owner, from_index: '0', limit: CREDENTIALS_PAGE},
      c.signal,
    )
      .then((tokens) => {
        if (!Array.isArray(tokens)) throw new Error('not a list');
        setRead({kind: 'done', credentials: tokens.map(parseCredential)});
      })
      .catch(() => {
        if (!c.signal.aborted) setRead({kind: 'error'});
      });
    return () => c.abort();
  }, [contract, rpc, owner, attempt]);

  useEffect(() => {
    if (!contract) return;
    const c = new AbortController();
    api
      // The API's maximum per request is 50 (receipts.ts); above it answers 422.
      .receipts(50, c.signal)
      .then((list) => setJobs(new Map(list.flatMap((r) => (r.chainJobId ? [[r.chainJobId, r.jobId]] : [])))))
      .catch(() => undefined);
    return () => c.abort();
  }, [contract]);

  if (!contract || !rpc) return null;
  const explorer = network.explorerBaseUrl;
  const contractHref = explorer ? safeHref(`${explorer.replace(/\/$/, '')}/address/${contract}`) : null;
  const count = read.kind === 'done' ? read.credentials.length : null;

  return (
    <Card
      title="Work credentials"
      labelledBy="work-credentials"
      description="Soulbound NFTs on NEAR, one for each paid job this account did and claimed. They cannot be transferred."
      actions={
        count !== null ? (
          <Badge tone="chain">
            <span data-testid="credentials-count">{count >= CREDENTIALS_PAGE ? `${count}+` : count}</span>
            <span className="sr-only"> credential{count === 1 ? '' : 's'}</span>
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        {read.kind === 'loading' && (
          <Loading label="Reading credentials from the chain">
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </Loading>
        )}
        {read.kind === 'error' && (
          <ErrorState
            title="Could not read credentials from the chain just now."
            action={
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                <Icon name="refresh" className="size-3.5" /> Read again
              </Button>
            }
          >
            The NEAR RPC node did not answer. Nothing was changed — this only reads.
          </ErrorState>
        )}
        {read.kind === 'done' && read.credentials.length === 0 && (
          <p className="text-muted" data-testid="credentials-empty">
            No credentials yet — they are issued when a job settles and its worker claims it.
          </p>
        )}
        {read.kind === 'done' && read.credentials.length > 0 && (
          <ul aria-label="Work credentials" className="divide-y divide-edge">
            {read.credentials.map((c) => (
              <CredentialRow
                key={c.tokenId}
                credential={c}
                network={network}
                contract={contract}
                jobId={c.chainJobId ? (jobs.get(c.chainJobId) ?? null) : null}
              />
            ))}
          </ul>
        )}
        {read.kind === 'done' && read.credentials.length >= CREDENTIALS_PAGE && (
          <p className="text-xs text-muted">Showing the first {CREDENTIALS_PAGE}.</p>
        )}
        <p data-testid="credentials-verify" className="text-xs leading-relaxed text-muted">
          <strong className="font-medium text-text">Verify on chain:</strong> this list is read in your
          browser from the contract{' '}
          {contractHref ? (
            <a href={contractHref} target="_blank" rel="noreferrer" className="text-accent underline">
              {contract}
              <span className="sr-only"> (opens the block explorer in a new tab)</span>
            </a>
          ) : (
            <span className="tabular">{contract}</span>
          )}{' '}
          on NEAR, by calling <code>nft_tokens_for_owner</code> for{' '}
          <span className="tabular break-all">{owner}</span> — not from Pactora’s server. Any NEAR app or
          wallet can make the same call.
        </p>
      </div>
    </Card>
  );
}

function CredentialRow({
  credential: c,
  network,
  contract,
  jobId,
}: {
  credential: Credential;
  network: NetworkInfo;
  contract: string;
  jobId: string | null;
}) {
  const token = network.paymentToken;
  const amount =
    c.amount === null
      ? null
      : c.token === null || c.token === token.accountId
        ? `${formatUnits(c.amount, token.decimals)} ${token.symbol}`
        : `${c.amount} base units of ${c.token}`;
  const onExplorer = tokenHref(network.explorerBaseUrl, contract, c.tokenId);
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium [overflow-wrap:anywhere]">{c.title}</p>
        <p className="text-xs text-muted">
          {amount ? <span className="tabular">{amount}</span> : 'Amount not recorded'}
          {' · '}
          {c.settledAt ? `settled ${utc(c.settledAt)}` : 'settled date not recorded'}
        </p>
      </div>
      <p className="flex shrink-0 flex-wrap gap-x-3 text-xs">
        {jobId && c.chainJobId && (
          <Link href={`/jobs/${encodeURIComponent(jobId)}`} className="text-accent underline">
            Open job #{c.chainJobId}
          </Link>
        )}
        {onExplorer && (
          <a href={onExplorer} target="_blank" rel="noreferrer" className="text-accent underline">
            On the explorer ↗
            <span className="sr-only">
              {' '}
              (credential #{c.tokenId} on the block explorer, opens in a new tab)
            </span>
          </a>
        )}
      </p>
    </li>
  );
}
