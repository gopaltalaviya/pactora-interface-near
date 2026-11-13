'use client';

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {Badge} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card, Stat} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {Icon, type IconName} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {ApiError, api, formatUnits, type NetworkInfo} from '@/lib/api';
import {readAgent, type AgentOnChain} from '@/lib/chain';
import {agentHref, manageHref, safeHref} from '@/lib/links';
import {displayAccount, formatYocto, parseUnits} from '@/lib/near';
import {useSession} from '@/lib/session';
import {signInHref} from '@/lib/signin-next';
import {AgentEditCard, KeyCard, ReissueCard, WebhooksCard} from '@/components/market/AgentAdmin';
import {MoneyPanel, useMoney} from '@/components/money/MoneyPanel';
import {storageLow} from '@/components/market/AgentHealth';
import {useLandOn} from '@/components/ui/useLandOn';
import {
  acceptWalletTransaction,
  cancelUnstakeTransaction,
  completeUnstakeTransaction,
  fundTransaction,
  requestUnstakeTransaction,
  sendTransaction,
  setCapsTransaction,
  stakeTransaction,
  storageDepositTransaction,
  unfreezeTransaction,
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
  // The API's own id for this agent, when the marketplace lists it (the key routes need it).
  // The API serves at most 100 a page (it refused 200, so the lookup never found one).
  const [listed, setListed] = useState<{agentId: string; name: string} | null>(null);
  const apiAgentId = listed?.agentId ?? null;
  /** The marketplace agent whose # is this page's number, when that is a different agent. */
  const [marketTwin, setMarketTwin] = useState<{name: string; chainAgentId: string} | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .agents({limit: 100}, controller.signal)
      .then((list) => {
        const found = list.find((a) => String(a.chainAgentId ?? '') === chainAgentId);
        if (found) setListed({agentId: String(found.agentId), name: found.name});
        // This page is addressed by the CONTRACT's id; a marketplace number in the
        // URL opened a different agent (live test, 2026-11-13). Point to the right page.
        const sameNumber = list.find(
          (a) => String(a.agentId) === chainAgentId && String(a.chainAgentId ?? '') !== chainAgentId,
        );
        setMarketTwin(
          sameNumber?.chainAgentId != null
            ? {name: sameNumber.name, chainAgentId: String(sameNumber.chainAgentId)}
            : null,
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [chainAgentId]);

  // The signed-in person's own record: it speaks of "you", and has no API key to manage.
  const ownPerson =
    session.status === 'in' && session.person !== null && session.person.chainAgentId === chainAgentId;

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

  // The owner's own wallet (what Fund and Stake draw on); the record itself is `data`, read above.
  const wallet = useMoney(network, {
    account: isOwner ? session.account : null,
    chainAgentId: null,
    record: false,
  });
  const walletToken = wallet.wallet?.token?.ok ? wallet.wallet.token.value : null;

  // Arrived from a fix link (#fund-card, #caps-card, ...): bring that card into view once it exists.
  const [hash, setHash] = useState('');
  useEffect(() => setHash(window.location.hash.replace(/^#/, '')), []);
  useLandOn(hash, data !== null && isOwner && hash !== '');

  const send = useCallback(
    async (label: string, build: () => Transaction) => {
      if (!session.account) return;
      setBusy(label);
      setError(null);
      setDone(null);
      try {
        // Built first: a malformed amount is refused before the wallet is asked.
        const tx = build();
        const signer = await session.ensureWallet();
        const sent = await sendTransaction(signer, session.account, tx, label);
        setDone({label, txHash: sent.txHash});
        setAttempt((n) => n + 1);
        // The wallet's own balances too: they stayed as before the send until
        // Refresh (live test, 2026-11-13).
        wallet.reload();
      } catch (err) {
        setError(message(err));
      } finally {
        setBusy(null);
      }
    },
    [session, wallet],
  );

  const back = ownPerson
    ? {href: '/me', label: 'My account'}
    : apiAgentId
      ? {href: agentHref(apiAgentId), label: listed?.name ?? 'Its profile'}
      : {href: '/agents', label: 'Marketplace'};
  const title = ownPerson
    ? 'Your person record'
    : listed
      ? `${listed.name}: money and keys`
      : `On-chain agent ${chainAgentId}`;
  const faucet = network?.testnet ? (
    <p className="mt-2 text-xs text-muted">
      Need test {symbol || 'tokens'}?{' '}
      <Link href="/me#faucet" className="text-accent underline">
        Claim them from the faucet
      </Link>{' '}
      on your account page, then stake here.
    </p>
  ) : null;

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
  /** The outcome of a send, shown in the card that made it (live test, 2026-11-13: it was at the top of the page). */
  const doneIn = (label: string) =>
    done?.label === label ? <DoneNote label={done.label} txHash={done.txHash} explorer={explorer} /> : null;
  const storageCard = pactora ? (
    <AmountCard
      id="storage"
      title="Add storage"
      hint="NEAR that pays for this agent’s records. Anyone can top it up; it stays with the agent."
      button="Deposit"
      result={doneIn('Storage deposit')}
      unit="NEAR"
      decimals={24}
      disabled={busy !== null}
      busy={busy === 'Storage deposit'}
      onSubmit={(yocto) =>
        send('Storage deposit', () => storageDepositTransaction(pactora, chainAgentId, yocto))
      }
    />
  ) : null;
  const walletRead = wallet.wallet?.token ?? null;
  const walletLine = walletRead
    ? walletRead.ok
      ? `In your wallet: ${units(walletRead.value)}.`
      : `Your wallet's ${symbol} could not be read.`
    : wallet.loading
      ? `Reading your wallet's ${symbol}...`
      : `Needs ${symbol} in your wallet.`;

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        eyebrow={ownPerson ? 'Fund and stake' : 'Owner controls'}
        title={title}
        description={
          <>
            {ownPerson && (
              <span className="mb-2 block">
                Your person record is an agent in the Pactora contract (#{chainAgentId}): its purse pays for
                the jobs you hire, and its stake is the bond that lets people and agents hire you.
              </span>
            )}
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
      {done && !INLINE_DONE.has(done.label) && (
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
      {marketTwin && (
        <Notice>
          <p data-testid="manage-id-twin">
            This page is on-chain agent {chainAgentId}. Looking for {marketTwin.name}, #{chainAgentId} on the
            marketplace? It is on-chain agent {marketTwin.chainAgentId}:{' '}
            <Link href={manageHref(marketTwin.chainAgentId)} className="underline">
              open its manage page
            </Link>
            .
          </p>
        </Notice>
      )}

      {session.status === 'loading' ? null : !isOwner ? (
        <Notice>
          {session.status === 'in'
            ? `You are signed in as ${displayAccount(session.account ?? '')}, which does not own this agent. You can read it; only ${displayAccount(agent.owner)} can change it.`
            : 'You are not signed in. Sign in with the owner’s account to fund or change this agent: one signature, no transaction.'}{' '}
          {session.status !== 'in' && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'Sign in'}
                disabled={busy !== null}
                onClick={() => {
                  setBusy('Sign in');
                  setError(null);
                  session
                    .signIn()
                    .catch((err: unknown) => setError(message(err)))
                    .finally(() => setBusy(null));
                }}
              >
                Sign in with your wallet
              </Button>{' '}
              <Link className="underline" href={signInHref(pathname)}>
                or on the sign-in page
              </Link>
            </>
          )}
        </Notice>
      ) : null}

      {agent.frozen && (
        <Notice>
          <p data-testid="agent-frozen">
            This agent is frozen: its wallet can do nothing and nobody can hire it. Open jobs still end by
            their deadlines.{' '}
            {isOwner && pactora ? (
              <>
                You own it, so you can lift the freeze with one signature.{' '}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'Unfreeze'}
                  disabled={busy !== null}
                  onClick={() => send('Unfreeze', () => unfreezeTransaction(pactora, chainAgentId))}
                >
                  Unfreeze
                </Button>
              </>
            ) : (
              `Only its owner, ${displayAccount(agent.owner)}, can unfreeze it.`
            )}
          </p>
        </Notice>
      )}
      {!agent.wallet && (
        <Notice>
          <p data-testid="wallet-not-accepted">
            {agent.pending_wallet
              ? `The wallet ${displayAccount(agent.pending_wallet)} has not accepted yet, so this agent cannot hire, work or be hired.`
              : 'This agent has no wallet yet, so it cannot hire, work or be hired.'}{' '}
            {agent.pending_wallet && session.account === agent.pending_wallet && pactora ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'Accept the wallet'}
                disabled={busy !== null}
                onClick={() =>
                  send('Accept the wallet', () => acceptWalletTransaction(pactora, chainAgentId))
                }
              >
                Accept as its wallet
              </Button>
            ) : agent.pending_wallet ? (
              `Next: sign in as ${displayAccount(agent.pending_wallet)} and open this page to accept, with one signature.`
            ) : (
              'Next: its owner names a wallet, which then accepts.'
            )}
          </p>
        </Notice>
      )}

      {isOwner && (
        <MoneyPanel
          network={network}
          money={{
            ...wallet,
            record: {ok: true, value: data},
            reload: () => {
              wallet.reload();
              setAttempt((n) => n + 1);
            },
          }}
          account={session.account}
          chainAgentId={chainAgentId}
          title={ownPerson ? 'Your money' : 'Money: your wallet and this agent'}
          subject={ownPerson ? 'you' : 'agent'}
          description="Your wallet (what Fund and Stake draw on) and this record, read from the chain just now."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Purse"
          description={
            ownPerson
              ? 'Money you have put in to pay for the work you hire, within the caps you set.'
              : 'What the agent can spend, within its caps.'
          }
          labelledBy="purse"
        >
          {purse ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Balance" value={units(purse.balance)} />
              <Stat label="Spent today" value={units(purse.spent_today)} />
              <Stat label="Per-task cap" value={units(purse.per_task_cap)} />
              <Stat label="Daily cap" value={units(purse.daily_cap)} />
              <Stat label="Left today" value={units(purse.daily_remaining)} />
              <Stat
                label="More frees up"
                value={
                  purse.next_release_at > now ? (
                    <span className="text-base">{new Date(purse.next_release_at * 1000).toUTCString()}</span>
                  ) : (
                    'nothing pending'
                  )
                }
                hint="Spending counts for 24 hours; this is when the oldest spend stops counting."
              />
            </div>
          ) : (
            <p className="text-sm text-muted">No purse.</p>
          )}
        </Card>

        <Card
          title="Stake"
          description={
            ownPerson
              ? 'Your bond. Below the minimum, nobody can hire you; a share is locked while you work a job.'
              : 'The bond that makes a worker hireable.'
          }
          labelledBy="stake"
        >
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
          {faucet}
          <p className="mt-3 text-xs text-muted">
            Storage held for {ownPerson ? 'your record' : 'this agent'}:{' '}
            {data.storage ? `${formatYocto(data.storage)} NEAR` : 'not read'}.
          </p>
          {data.storage && /^\d+$/.test(data.storage) && storageLow(BigInt(data.storage)) && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-refused" data-testid="storage-low">
              <Icon name="alert" className="mt-px size-3.5" />
              <span>
                Storage is almost used up. Each new job needs a little; without it the contract refuses the
                next job.{' '}
                <a href="#storage-card" className="underline">
                  Add storage
                </a>
                .
              </span>
            </p>
          )}
        </Card>
      </div>

      {isOwner && pactora && (
        <div className="grid gap-4 md:grid-cols-2">
          <AmountCard
            id="fund"
            title="Fund the purse"
            hint={`Moves ${symbol} from your account into the purse. ${walletLine}`}
            max={walletToken}
            button="Fund"
            result={doneIn('Fund')}
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
            max={walletToken}
            button="Stake"
            result={doneIn('Stake')}
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
                max={stake?.unlocked ?? null}
                onSubmit={(amount) =>
                  send('Request unstake', () => requestUnstakeTransaction(pactora, chainAgentId, amount))
                }
              />
            )}
            {doneIn('Request unstake')}
          </Card>
          <AmountCard
            id="withdraw"
            title="Withdraw from the purse"
            hint={`Sends ${symbol} to your account.`}
            max={purse?.balance ?? null}
            button="Withdraw"
            result={doneIn('Withdraw')}
            unit={symbol}
            decimals={decimals}
            disabled={busy !== null || !purse || purse.balance === '0'}
            busy={busy === 'Withdraw'}
            onSubmit={(amount) => send('Withdraw', () => withdrawTransaction(pactora, chainAgentId, amount))}
          />
          {storageCard}
        </div>
      )}

      {/* Anyone may top up an agent's storage (the contract allows it); it was owner-only
          on this page (live test, 2026-11-13). */}
      {!isOwner && session.status === 'in' && pactora && (
        <div className="grid gap-4 md:grid-cols-2">{storageCard}</div>
      )}

      {isOwner && !tokenId && (
        <Notice>The API does not name the payment token yet, so funding and staking are off.</Notice>
      )}

      {isOwner && apiAgentId && !ownPerson && (
        <p className="text-sm">
          <Link href={agentHref(apiAgentId)} className="text-accent underline">
            Its marketplace profile (#{apiAgentId})
          </Link>
          <span className="text-muted">
            {' '}
            · this page is addressed by the contract&apos;s id {chainAgentId}, the profile by the
            marketplace&apos;s.
          </span>
        </p>
      )}

      {isOwner && ownPerson && (
        <Notice>
          A person record has no API key: you act with your wallet, signed in.{' '}
          <Link href="/me" className="underline">
            Back to your account
          </Link>
          .
        </Notice>
      )}

      {isOwner && !ownPerson && (
        <section aria-labelledby="credentials" className="space-y-4">
          <h2 id="credentials" className="text-lg font-semibold tracking-tight">
            Credentials and record
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ReissueCard chainAgentId={chainAgentId} suggestedAgentId={apiAgentId} />
            <KeyCard />
            <AgentEditCard suggestedAgentId={apiAgentId} decimals={decimals} symbol={symbol} />
            <WebhooksCard />
          </div>
        </section>
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
  max = null,
}: {
  id: string;
  button: string;
  unit: string;
  decimals: number;
  disabled: boolean;
  busy: boolean;
  onSubmit: (base: string) => void;
  /** The most this can take, base units: a Max button fills it in. Null: no Max. */
  max?: string | null;
}) {
  const [text, setText] = useState('');
  const base = text.trim() === '' ? null : parseUnits(text, decimals);
  const invalid = text.trim() !== '' && (base === null || base === '0');
  // Over the known most (wallet, purse or unlocked stake): the chain would only refuse it,
  // after the wallet prompt and the gas (manual live test, 2026-11-13).
  const knownMax = max !== null && /^\d{1,40}$/.test(max) ? BigInt(max) : null;
  const over = !invalid && base !== null && knownMax !== null && BigInt(base) > knownMax;
  // Cleared once the transaction went out: a stale amount under "Fund sent." read as not sent (L18).
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) setText('');
    wasBusy.current = busy;
  }, [busy]);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (base && base !== '0' && !over) onSubmit(base);
      }}
    >
      <Field
        label={`Amount (${unit})`}
        htmlFor={`${id}-amount`}
        hintId={`${id}-hint`}
        error={
          invalid
            ? `A positive number with at most ${decimals} decimal places, like 1.5.`
            : over && max !== null
              ? `More than you have: at most ${formatUnits(max, decimals)} ${unit}.`
              : undefined
        }
      >
        <TextInput
          id={`${id}-amount`}
          mono
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          invalid={invalid || over}
          placeholder="1.5"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          loading={busy}
          disabled={disabled || !base || base === '0' || over}
          icon={BUTTON_ICON[button]}
        >
          {button}
        </Button>
        {max !== null && /^\d{1,40}$/.test(max) && max !== '0' && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Max ${button.toLowerCase()} amount: ${formatUnits(max, decimals)} ${unit}`}
            onClick={() => setText(formatUnits(max, decimals))}
          >
            Max
          </Button>
        )}
      </div>
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
  max?: string | null;
  /** What the last send from this card did, shown under its form. */
  result?: ReactNode;
}) {
  const {result, ...form} = rest;
  return (
    <Card title={title} description={hint} labelledBy={`${id}-card`}>
      <AmountForm id={id} {...form} />
      {result}
    </Card>
  );
}

/** The icon beside each amount action's label. */
const BUTTON_ICON: Record<string, IconName | undefined> = {
  Fund: 'coins',
  Stake: 'shield',
  'Request unstake': 'minus',
  Withdraw: 'wallet',
  Deposit: 'plus',
};

const INLINE_DONE = new Set(['Fund', 'Stake', 'Request unstake', 'Withdraw', 'Storage deposit']);

function DoneNote({
  label,
  txHash,
  explorer,
}: {
  label: string;
  txHash: string | null;
  explorer: string | null;
}) {
  const href = txHash && explorer ? safeHref(`${explorer}/txns/${txHash}`) : null;
  return (
    <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-settled" data-testid="card-done">
      <Icon name="check" className="size-4" />
      <span>
        {label} sent.
        {href ? (
          <>
            {' '}
            <a className="underline" href={href} target="_blank" rel="noreferrer">
              View the transaction
            </a>
            .
          </>
        ) : null}
      </span>
    </p>
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
