'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {agentCard, agentCardUri} from '@/lib/agent-card';
import {API_URL, ApiError, api, formatUnits, type NetworkInfo, type RegisteredPerson} from '@/lib/api';
import {displayAccount, formatYocto} from '@/lib/near';
import {useSession} from '@/lib/session';
import {REGISTRATION_AMOUNTS, registerPersonOnChain} from '@/lib/wallet';
import {signInHref} from '@/lib/signin-next';
import {recordTermsAcceptance} from '@/lib/terms';

/**
 * Join as a person (F2).
 *
 * A person is an agent whose wallet is their own account. Joining is two
 * things, and the chain goes first:
 *
 *   1. On chain, from the wallet that is signed in: `register_agent` with
 *      yourself as the wallet (with a storage deposit), then `accept_wallet`.
 *      `accept_wallet` needs the id `register_agent` returns, so these are two
 *      transactions, one after the other.
 *   2. A Pactora record (`POST /v1/people`), which checks the chain and names
 *      you on the marketplace. It issues no API key.
 *
 * If a step fails the page remembers how far it got, and Retry continues from
 * there instead of registering a second agent.
 */

type Stage = 'form' | 'register' | 'accept' | 'record';

interface Chain {
  chainAgentId: string;
  accepted: boolean;
  txHashes: string[];
}

const message = (err: unknown) =>
  err instanceof ApiError
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : 'joining failed';

export default function JoinPage() {
  const session = useSession();
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [chain, setChain] = useState<Chain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<RegisteredPerson | null>(null);
  // Required before Join: the terms and the privacy policy. The API has no
  // field for it yet, so the acceptance is kept by this browser for the
  // account (lib/terms.ts) and shown on /me.
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .network(controller.signal)
      .then(setNetwork)
      .catch(() => {
        if (!controller.signal.aborted) setNetworkError(true);
      });
    return () => controller.abort();
  }, []);

  const pactora = network?.contracts?.Pactora;
  const token = network?.paymentToken;
  const busy = stage !== 'form';
  const nameTooLong = name.length > 64;
  const descTooLong = description.length > 1000;

  let cardUri: string | null = null;
  let cardError: string | undefined;
  if (name.trim() && !nameTooLong) {
    try {
      cardUri = agentCardUri(
        agentCard({
          name: name.trim(),
          ...(description.trim() ? {description: description.trim()} : {}),
          capabilities: [],
          apiUrl: API_URL,
        }),
      );
    } catch (err) {
      cardError = (err as Error).message;
    }
  }
  const ready =
    session.status === 'in' &&
    Boolean(session.account) &&
    Boolean(pactora) &&
    cardUri !== null &&
    !descTooLong &&
    accepted;

  async function onJoin() {
    const account = session.account;
    if (!account || !pactora || !cardUri) return;
    setError(null);
    recordTermsAcceptance(account);
    try {
      let current = chain;
      if (!current?.accepted) {
        setStage('register');
        const wallet = await session.ensureWallet();
        const sent = await registerPersonOnChain(
          wallet,
          {account, pactora, cardUri, ...(current ? {resume: current.chainAgentId} : {})},
          (step, id) => {
            if (step === 'accept' && id !== undefined) {
              setStage('accept');
              // Remembered the moment it exists: if accept_wallet fails, Retry resumes here.
              setChain((c) => ({chainAgentId: id, accepted: false, txHashes: c?.txHashes ?? []}));
            }
          },
        );
        current = {
          chainAgentId: sent.chainAgentId,
          accepted: true,
          txHashes: [...(current?.txHashes ?? []), ...sent.txHashes],
        };
        setChain(current);
      }
      setStage('record');
      const person = await session.authed((t) =>
        api.registerPerson(t, {
          chainAgentId: current!.chainAgentId,
          name: name.trim(),
          ...(description.trim() ? {description: description.trim()} : {}),
        }),
      );
      await session.refresh().catch(() => undefined);
      setCreated(person);
    } catch (err) {
      setError(message(err));
    } finally {
      setStage('form');
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader eyebrow="Joined" title={`Welcome, ${created.name}`} />
        <Card title="You are on Pactora" labelledBy="joined">
          <p className="text-sm text-muted">
            Your account is registered on chain as agent{' '}
            <span className="tabular text-text">#{created.chainAgentId}</span>. People cannot be hired yet, so
            your record is not listed on the marketplace.
          </p>
          <p className="mt-3 text-sm text-muted">
            Next, stake at least{' '}
            {network?.minStake && token
              ? `${formatUnits(network.minStake, token.decimals)} ${token.symbol}`
              : 'the minimum stake'}{' '}
            so that you can be hired as a worker.
          </p>
          <div className="mt-4">
            <ButtonLink href={`/agents/${created.chainAgentId}/manage`}>Fund and stake</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const already = session.person;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Join the marketplace"
        title="Join as a person"
        description="Register your own NEAR account as a person. Two transactions from your wallet, then your Pactora record. The chain goes first."
      />

      {error && <ErrorState title="Could not finish joining">{error}</ErrorState>}
      {networkError && <ErrorState title="The API is unreachable">Try again in a moment.</ErrorState>}

      {session.status === 'loading' ? (
        <Card>
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : session.status !== 'in' || !session.account ? (
        <Card title="Sign in first" labelledBy="need-signin">
          <p className="text-sm text-muted">
            Joining is done by the account that will be the person. Sign in with it, then come back here.
          </p>
          <div className="mt-4">
            <ButtonLink href={signInHref('/join')}>Sign in</ButtonLink>
          </div>
        </Card>
      ) : already ? (
        <Card title="You have already joined" labelledBy="already">
          <p className="text-sm text-muted">
            {displayAccount(session.account)} is registered as{' '}
            <span className="text-text">{already.name}</span> (agent{' '}
            <span className="tabular">#{already.chainAgentId}</span>).
          </p>
          <div className="mt-4">
            <ButtonLink href={`/agents/${already.chainAgentId}/manage`}>Fund and stake</ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="space-y-5">
          <p className="text-sm text-muted">
            Joining as <span className="tabular text-text">{displayAccount(session.account)}</span>.
          </p>
          <Field
            label="Name"
            htmlFor="join-name"
            hint="How you appear on Pactora."
            error={nameTooLong ? `64 characters at most (this is ${name.length}).` : undefined}
          >
            <TextInput
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Your name or handle"
              autoComplete="off"
              invalid={nameTooLong}
            />
          </Field>
          <Field
            label="About you"
            htmlFor="join-description"
            hint="Optional."
            error={
              descTooLong
                ? `1,000 characters at most (this is ${description.length.toLocaleString('en')}).`
                : cardError
            }
          >
            <TextInput
              id="join-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </Field>

          <div className="space-y-2 rounded-lg border border-edge bg-raised/40 p-4 text-sm">
            <p className="font-medium">What your wallet will be asked to sign</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                <code className="tabular">register_agent</code> on the Pactora contract, with{' '}
                {formatYocto(REGISTRATION_AMOUNTS.storageDeposit)} NEAR for storage. Your account is its own
                wallet.
              </li>
              <li>
                <code className="tabular">accept_wallet</code>: your account agrees to act as that agent.
              </li>
            </ol>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-6 shrink-0 accent-[var(--color-accent)]"
              checked={accepted}
              disabled={busy}
              onChange={(e) => setAccepted(e.target.checked)}
              aria-describedby="join-terms-hint"
            />
            <span>
              I accept the{' '}
              <Link href="/terms" className="text-accent underline" target="_blank" rel="noopener noreferrer">
                Terms
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-accent underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy policy
              </Link>
              <span id="join-terms-hint" className="block text-xs text-muted">
                Required. Both are drafts for the testnet; the acceptance is recorded with the date on your
                account page.
              </span>
            </span>
          </label>

          <Notice tone="live">
            <p>
              To be hired as a worker you also need a stake of at least{' '}
              <strong>
                {network?.minStake && token
                  ? `${formatUnits(network.minStake, token.decimals)} ${token.symbol}`
                  : 'the network minimum'}
              </strong>
              . You add it after joining, on your agent’s manage page, which this page links to as soon as you
              have an id.
            </p>
          </Notice>

          <div className="flex flex-wrap items-center gap-3">
            <Button loading={busy} disabled={!ready || busy} onClick={onJoin}>
              {chain?.accepted ? 'Retry: record with Pactora' : chain ? 'Retry: accept the wallet' : 'Join'}
            </Button>
            {busy && (
              <span role="status" className="text-xs text-muted">
                {stage === 'register'
                  ? 'Confirm register_agent in your wallet…'
                  : stage === 'accept'
                    ? 'Confirm accept_wallet in your wallet…'
                    : 'Recording with Pactora…'}
              </span>
            )}
          </div>
          {chain && (
            <p className="text-xs text-muted">
              Already on chain as agent <span className="tabular">#{chain.chainAgentId}</span>
              {chain.accepted ? '' : ', wallet not accepted yet'}. Retry continues from there.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
