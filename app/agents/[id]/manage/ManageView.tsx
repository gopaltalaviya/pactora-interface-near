'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState, type ReactNode} from 'react';
import {Badge} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card, Stat} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {ApiError, api, formatUnits, type NetworkInfo} from '@/lib/api';
import {readAgent, type AgentOnChain} from '@/lib/chain';
import {safeHref} from '@/lib/links';
import {displayAccount, formatYocto, parseUnits} from '@/lib/near';
import {useSession} from '@/lib/session';
import {signInHref} from '@/lib/signin-next';
import {
  cancelUnstakeTransaction,
  completeUnstakeTransaction,
  fundTransaction,
  requestUnstakeTransaction,
  sendTransaction,
  setCapsTransaction,
  stakeTransaction,
  storageDepositTransaction,
  withdrawTransaction,
  type Transaction,
} from '@/lib/wallet';

/**
 * One agent's money, for the person who owns it.
 *
 * Everything shown is read from the contract (`get_agent`, `purse_of`,
 * `stake_of`, `storage_balance_of`) through the NEAR RPC, and every button is
 * one transaction your wallet shows you before it signs. The buttons appear
 * only when the signed-in account IS the owner on chain; anyone else sees the
 * numbers and nothing to press. (The contract enforces ownership regardless:
 * this is about not offering a button that can only fail.)
 */

const DEFAULT_RPC = 'https://rpc.testnet.near.org';

const message = (err: unknown) =>
  err instanceof ApiError
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : 'something went wrong';

type Done = {label: string; txHash: string | null};

export function ManageView({chainAgentId}: {chainAgentId: string}) {
  const session = useSession();
  const pathname = `/agents/${chainAgentId}/manage`;
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [data, setData] = useState<AgentOnChain | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .network(controller.signal)
      .then(setNetwork)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(message(err));
      });
    return () => controller.abort();
  }, []);

  const pactora = network?.contracts?.Pactora;
  const rpc = network?.rpcUrls?.[0] ?? DEFAULT_RPC;

  useEffect(() => {
    if (!pactora) return;
    const controller = new AbortController();
    setLoadError(null);
    readAgent(rpc, pactora, chainAgentId, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(message(err));
      });
    return () => controller.abort();
  }, [pactora, rpc, chainAgentId, attempt]);

  const token = network?.paymentToken;
  const tokenId = token?.accountId ?? null;
  const decimals = token?.decimals ?? 6;
  const symbol = token?.symbol ?? '';
  const units = (base: string) => `${formatUnits(base, decimals)} ${symbol}`.trim();

  const owner = data?.agent?.owner ?? null;
  const isOwner = session.status === 'in' && session.account !== null && session.account === owner;

  const send = useCallback(
    async (label: string, build: () => Transaction) => {
      if (!session.account) return;
      setBusy(label);
      setError(null);
      setDone(null);
      try {
        // Built first: a malformed amount is refused before the wallet is asked.
        const tx = build();
        const wallet = await session.ensureWallet();
        const sent = await sendTransaction(wallet, session.account, tx, label);
        setDone({label, txHash: sent.txHash});
        setAttempt((n) => n + 1);
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(null);
      }
    },
    [session],
  );

  const back = {href: '/agents', label: 'Marketplace'};
  const title = `Agent #${chainAgentId}`;

  if (loadError && !data) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Could not load this agent" />
        <ErrorState
          title={loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!data || !network) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title={title} />
        <div role="status" aria-label="Loading the agent" className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!data.agent) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="Agent not found" />
        <ErrorState title={`The Pactora contract has no agent #${chainAgentId}.`} />
      </div>
    );
  }

  const {agent, purse, stake} = data;
  const now = Math.floor(Date.now() / 1000);
  const minStake = network.minStake;
  const explorer = network.explorerBaseUrl;

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow="Owner controls"
        title={title}
        description={
          <>
            Owned by <span className="tabular">{displayAccount(agent.owner)}</span>
            {agent.wallet ? (
              <>
                {' '}
                · wallet <span className="tabular">{displayAccount(agent.wallet)}</span>
              </>
            ) : (
              ' · wallet not accepted yet'
            )}
          </>
        }
        actions={
          <>
            {agent.frozen && <Badge tone="broken">Frozen</Badge>}
            {stake && (
              <Badge tone={stake.hireable ? 'settled' : 'refused'}>
                {stake.hireable ? 'Hireable' : 'Not hireable'}
              </Badge>
            )}
          </>
        }
      />

      {error && <ErrorState title="That did not go through">{error}</ErrorState>}
      {done && (
        <Notice tone="live">
          <p role="status">
            {done.label} sent.
            {done.txHash && explorer && safeHref(`${explorer}/txns/${done.txHash}`) ? (
              <>
                {' '}
                <a
                  className="underline"
                  href={safeHref(`${explorer}/txns/${done.txHash}`) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  View the transaction
                </a>
                .
              </>
            ) : null}
          </p>
        </Notice>
      )}
      {loadError && <ErrorState title={loadError} />}

      {session.status === 'loading' ? null : !isOwner ? (
        <Notice>
          {session.status === 'in'
            ? `You are signed in as ${displayAccount(session.account ?? '')}, which does not own this agent. You can read it; only ${displayAccount(agent.owner)} can change it.`
            : 'You are not signed in. Sign in with the owner’s account to fund or change this agent.'}{' '}
          {session.status !== 'in' && (
            <Link className="underline" href={signInHref(pathname)}>
              Sign in
            </Link>
          )}
        </Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Purse" description="What the agent can spend, within its caps." labelledBy="purse">
          {purse ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Balance" value={units(purse.balance)} />
              <Stat label="Spent today" value={units(purse.spent_today)} />
              <Stat label="Per-task cap" value={units(purse.per_task_cap)} />
              <Stat label="Daily cap" value={units(purse.daily_cap)} />
              <Stat label="Left today" value={units(purse.daily_remaining)} />
            </div>
          ) : (
            <p className="text-sm text-muted">No purse.</p>
          )}
        </Card>

        <Card title="Stake" description="The bond that makes a worker hireable." labelledBy="stake">
          {stake ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Available" value={units(stake.available)} />
              <Stat label="Locked in jobs" value={units(stake.locked)} />
              <Stat label="Unlocked" value={units(stake.unlocked)} />
              <Stat label="Unstaking" value={units(stake.pending)} />
              {minStake && <Stat label="Minimum to be hireable" value={units(minStake)} />}
              {stake.pending !== '0' && stake.unlock_at > 0 && (
                <Stat label="Can be withdrawn" value={new Date(stake.unlock_at * 1000).toUTCString()} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No stake record.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            Storage held for this agent: {data.storage ? `${formatYocto(data.storage)} NEAR` : 'not read'}.
          </p>
        </Card>
      </div>

      {isOwner && pactora && (
        <div className="grid gap-4 md:grid-cols-2">
          <AmountCard
            id="fund"
            title="Fund the purse"
            hint={`Moves ${symbol} from your account into the purse. Needs ${symbol} in your wallet.`}
            button="Fund"
            unit={symbol}
            decimals={decimals}
            disabled={busy !== null || !tokenId}
            busy={busy === 'Fund'}
            onSubmit={(amount) =>
              send('Fund', () => fundTransaction(tokenId!, pactora, chainAgentId, amount))
            }
          />
          <AmountCard
            id="stake"
            title="Add to the stake"
            hint={
              minStake
                ? `At least ${units(minStake)} unlocked makes a worker hireable.`
                : 'A worker needs the network minimum to be hireable.'
            }
            button="Stake"
            unit={symbol}
            decimals={decimals}
            disabled={busy !== null || !tokenId}
            busy={busy === 'Stake'}
            onSubmit={(amount) =>
              send('Stake', () => stakeTransaction(tokenId!, pactora, chainAgentId, amount))
            }
          />
          <CapsCard
            decimals={decimals}
            symbol={symbol}
            initial={purse}
            disabled={busy !== null}
            busy={busy === 'Set caps'}
            onSubmit={(perTask, daily) =>
              send('Set caps', () => setCapsTransaction(pactora, chainAgentId, perTask, daily))
            }
          />
          <Card
            title="Unstake"
            description="Leaving the stake takes a delay, and can be cancelled."
            labelledBy="unstake"
          >
            {stake && stake.pending !== '0' ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted">
                  {units(stake.pending)} is waiting to leave
                  {stake.unlock_at > now
                    ? `, available ${new Date(stake.unlock_at * 1000).toUTCString()}.`
                    : ' and can be withdrawn now.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy !== null || stake.unlock_at > now}
                    loading={busy === 'Complete unstake'}
                    onClick={() =>
                      send('Complete unstake', () => completeUnstakeTransaction(pactora, chainAgentId))
                    }
                  >
                    Complete unstake
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    loading={busy === 'Cancel unstake'}
                    onClick={() =>
                      send('Cancel unstake', () => cancelUnstakeTransaction(pactora, chainAgentId))
                    }
                  >
                    Cancel unstake
                  </Button>
                </div>
              </div>
            ) : (
              <AmountForm
                id="unstake"
                button="Request unstake"
                unit={symbol}
                decimals={decimals}
                disabled={busy !== null || !stake || stake.unlocked === '0'}
                busy={busy === 'Request unstake'}
                onSubmit={(amount) =>
                  send('Request unstake', () => requestUnstakeTransaction(pactora, chainAgentId, amount))
                }
              />
            )}
          </Card>
          <AmountCard
            id="withdraw"
            title="Withdraw from the purse"
            hint={`Sends ${symbol} to your account.`}
            button="Withdraw"
            unit={symbol}
            decimals={decimals}
            disabled={busy !== null || !purse || purse.balance === '0'}
            busy={busy === 'Withdraw'}
            onSubmit={(amount) => send('Withdraw', () => withdrawTransaction(pactora, chainAgentId, amount))}
          />
          <AmountCard
            id="storage"
            title="Add storage"
            hint="NEAR that pays for this agent’s records. Anyone can top it up; it stays with the agent."
            button="Deposit"
            unit="NEAR"
            decimals={24}
            disabled={busy !== null}
            busy={busy === 'Storage deposit'}
            onSubmit={(yocto) =>
              send('Storage deposit', () => storageDepositTransaction(pactora, chainAgentId, yocto))
            }
          />
        </div>
      )}

      {isOwner && !tokenId && (
        <Notice>The API does not name the payment token yet, so funding and staking are off.</Notice>
      )}

      <p className="text-xs text-muted">
        Every action is a transaction your wallet shows before it signs. Testnet only.{' '}
        <ButtonLink href="/status" size="sm" variant="ghost">
          System status
        </ButtonLink>
      </p>
    </div>
  );
}

/** A decimal amount and a button: parsed with BigInt, never a float. */
function AmountForm({
  id,
  button,
  unit,
  decimals,
  disabled,
  busy,
  onSubmit,
}: {
  id: string;
  button: string;
  unit: string;
  decimals: number;
  disabled: boolean;
  busy: boolean;
  onSubmit: (base: string) => void;
}) {
  const [text, setText] = useState('');
  const base = text.trim() === '' ? null : parseUnits(text, decimals);
  const invalid = text.trim() !== '' && (base === null || base === '0');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (base && base !== '0') onSubmit(base);
      }}
    >
      <Field
        label={`Amount (${unit})`}
        htmlFor={`${id}-amount`}
        hintId={`${id}-hint`}
        error={invalid ? `A positive number with at most ${decimals} decimal places, like 1.5.` : undefined}
      >
        <TextInput
          id={`${id}-amount`}
          mono
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          invalid={invalid}
          placeholder="1.5"
        />
      </Field>
      <Button type="submit" size="sm" loading={busy} disabled={disabled || !base || base === '0'}>
        {button}
      </Button>
    </form>
  );
}

function AmountCard({
  id,
  title,
  hint,
  ...rest
}: {
  id: string;
  title: string;
  hint: ReactNode;
  button: string;
  unit: string;
  decimals: number;
  disabled: boolean;
  busy: boolean;
  onSubmit: (base: string) => void;
}) {
  return (
    <Card title={title} description={hint} labelledBy={`${id}-card`}>
      <AmountForm id={id} {...rest} />
    </Card>
  );
}

function CapsCard({
  decimals,
  symbol,
  initial,
  disabled,
  busy,
  onSubmit,
}: {
  decimals: number;
  symbol: string;
  initial: {per_task_cap: string; daily_cap: string} | null;
  disabled: boolean;
  busy: boolean;
  onSubmit: (perTask: string, daily: string) => void;
}) {
  const [perTask, setPerTask] = useState(initial ? formatUnits(initial.per_task_cap, decimals) : '');
  const [daily, setDaily] = useState(initial ? formatUnits(initial.daily_cap, decimals) : '');
  const a = parseUnits(perTask, decimals);
  const b = parseUnits(daily, decimals);
  const bad = a === null || b === null;
  const order = !bad && BigInt(a) > BigInt(b);
  return (
    <Card
      title="Spending caps"
      description="The most the agent can spend on one task and in one day."
      labelledBy="caps-card"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!bad && !order) onSubmit(a, b);
        }}
      >
        <Field
          label={`Per task (${symbol})`}
          htmlFor="caps-task"
          error={perTask !== '' && a === null ? 'Not a valid amount.' : undefined}
        >
          <TextInput
            id="caps-task"
            mono
            inputMode="decimal"
            autoComplete="off"
            value={perTask}
            onChange={(e) => setPerTask(e.target.value)}
            invalid={perTask !== '' && a === null}
          />
        </Field>
        <Field
          label={`Per day (${symbol})`}
          htmlFor="caps-daily"
          error={
            daily !== '' && b === null
              ? 'Not a valid amount.'
              : order
                ? 'The daily cap cannot be below the per-task cap.'
                : undefined
          }
        >
          <TextInput
            id="caps-daily"
            mono
            inputMode="decimal"
            autoComplete="off"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            invalid={(daily !== '' && b === null) || order}
          />
        </Field>
        <Button type="submit" size="sm" loading={busy} disabled={disabled || bad || order}>
          Set caps
        </Button>
      </form>
    </Card>
  );
}
