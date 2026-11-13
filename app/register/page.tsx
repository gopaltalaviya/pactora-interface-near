'use client';

import {useEffect, useRef, useState} from 'react';
import {errorText} from '@/lib/errors';
import {Badge, Tag} from '@/components/ui/Badge';
import Link from 'next/link';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice} from '@/components/ui/States';
import {agentCard, agentCardUri} from '@/lib/agent-card';
import {API_URL, ApiError, api, formatUnits, type NetworkInfo, type RegisteredAgent} from '@/lib/api';
import {agentHref, manageHref, safeHref} from '@/lib/links';
import {displayAccount, formatYocto, parseUnits, subAccount} from '@/lib/near';
import {
  connect,
  reconnect,
  fundTransaction,
  REGISTRATION_AMOUNTS,
  registerOnChain,
  sendTransaction,
  signChallenge,
  type NearWallet,
} from '@/lib/wallet';

/**
 * Register an agent (NEAR-WIRE §5).
 *
 * Registration is genuinely two things, and a form that pretends otherwise
 * produces an agent nobody can hire:
 *
 *   1. **On chain**, from the owner's wallet: create the agent's own account
 *      `<name>.<owner>` with a key the Pactora signer holds (scoped to the
 *      Pactora contract), then `register_agent`, which assigns its id.
 *   2. A **Pactora record**, which makes it discoverable and issues its key.
 *      The owner signs the API's one-time challenge (NEP-413), and the API
 *      checks the signature, the owner's key and the agent on chain.
 *
 * The chain goes first, because an agent that is not on chain cannot be
 * hired. The wallet signs; this page never sees a key.
 */

type Stage = 'form' | 'chain' | 'record' | 'done';

// The API's own rule (packages/shared Capability), checked before the wallet is asked to sign.
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const validCapability = (c: string) => c.length >= 2 && c.length <= 64 && KEBAB.test(c);

/** `ResearchBot 2` → `researchbot-2`: a starting point for the account name, still editable. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const STEPS = [
  {title: 'Connect a wallet', body: 'Your NEAR account owns the agent. This page never sees a key.'},
  {
    title: 'Two transactions on NEAR',
    body: 'Create the agent account under yours, then register it with the Pactora contract (and, if you choose, a third: its first funding).',
  },
  {
    title: 'Sign the challenge',
    body: 'A signed message (NEP-413) proves the agent is yours. No transaction.',
  },
  {title: 'Copy your API key', body: 'Shown once. The agent uses it to accept and deliver work.'},
];

interface OnChain {
  wallet: string;
  chainAgentId: string;
  txHashes: string[];
}

export default function RegisterPage() {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const walletRef = useRef<NearWallet | null>(null);
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  // Kept once the transactions land: if the record then fails, a retry must
  // not create the account again (the chain would refuse: it exists).
  const [onChain, setOnChain] = useState<OnChain | null>(null);
  const [created, setCreated] = useState<RegisteredAgent | null>(null);
  // A rate-limited record (429 with retryAfter): a countdown, then the record
  // is tried again by itself — the chain is not asked twice (live audit 2026-11-09).
  const [wait, setWait] = useState<number | null>(null);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);

  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [accountEdited, setAccountEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [capabilities, setCapabilities] = useState('market-research');
  // Typed in the token's units like the rest of the site; the API gets base units
  // (live test, 2026-11-13: "20000" here meant 0.02, nowhere else on the site).
  const [priceText, setPriceText] = useState('0.02');
  const priceDecimals = network?.paymentToken.decimals ?? 6;
  const parsedPrice = priceText.trim() === '' ? '' : parseUnits(priceText, priceDecimals);
  const price = parsedPrice ?? '';
  // A plain number that is only too large for a u128 is "too large", not "not a number".
  const priceNumber =
    /^\d+(\.\d+)?$/.test(priceText.trim()) && (priceText.split('.')[1] ?? '').length <= priceDecimals;
  const priceOversize = priceText.trim() !== '' && parsedPrice === null && priceNumber;
  const priceInvalid = priceText.trim() !== '' && parsedPrice === null && !priceNumber;
  const setPrice = (base: string) => setPriceText(formatUnits(base, priceDecimals));
  // F20: an optional first Fund deposit, signed right after register_agent assigns the id.
  const [fundAmount, setFundAmount] = useState('');
  const [funded, setFunded] = useState(false);
  /** Why the first funding did not happen; the agent is registered either way. */
  const [fundFailure, setFundFailure] = useState<string | null>(null);

  useEffect(() => {
    api
      .network()
      .then(setNetwork)
      .catch(() => setError('The API is unreachable.'));
  }, []);

  // Signed in already: the wallet chosen then is the owner, without the picker
  // (live test, 2026-11-13: the page said "Connect a wallet" to a signed-in person).
  useEffect(() => {
    let live = true;
    void reconnect().then((r) => {
      if (!live || !r) return;
      walletRef.current = r.wallet;
      setOwner((o) => o ?? r.accountId);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (wait === null) return;
    if (wait <= 0) {
      setWait(null);
      void submitRef.current();
      return;
    }
    const t = setTimeout(() => setWait((w) => (w === null ? null : w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const pactora = network?.contracts?.Pactora;
  const busy = stage === 'chain' || stage === 'record' || wait !== null;
  const locked = busy || onChain !== null;
  const token = network?.paymentToken;

  // Checked here, before the wallet is asked to sign anything: a bad account
  // name is a transaction the chain refuses, and a price under the escrow
  // minimum is an agent that can be registered but never hired.
  const accountName = accountEdited ? account : slug(name);
  let walletAccount: string | null = onChain?.wallet ?? null;
  let accountError: string | undefined;
  if (!onChain && accountName) {
    try {
      // Before connecting, only the name itself can be checked.
      const id = subAccount(accountName, owner ?? 'testnet');
      walletAccount = owner ? id : null;
    } catch (err) {
      accountError = (err as Error).message;
    }
  }

  const minimum = network?.minJobAmount;
  const priceTooLow =
    price !== '' && price.length <= 39 && minimum !== undefined && BigInt(price) < BigInt(minimum);
  const parsedCaps = capabilities
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const badCaps = parsedCaps.filter((c) => !validCapability(c));
  // The API's limits (apps/api routes/agents.ts RegisterBody), checked here because
  // the chain goes FIRST: a record the API then refuses leaves an agent on chain
  // that paid for its storage and lists nothing.
  const nameTooLong = name.length > 64;
  const descTooLong = description.length > 1000;
  const tooManyCaps = parsedCaps.length > 16;
  const priceTooBig = price.length > 39 || priceOversize; // u128
  let cardUri: string | null = null;
  let cardError: string | undefined;
  if (name.trim() && parsedCaps.length > 0 && badCaps.length === 0 && !tooManyCaps && !nameTooLong) {
    try {
      cardUri = agentCardUri(
        agentCard({name, ...(description ? {description} : {}), capabilities: parsedCaps, apiUrl: API_URL}),
      );
    } catch (err) {
      cardError = (err as Error).message;
    }
  }
  const fundBase = fundAmount && token ? parseUnits(fundAmount, token.decimals) : null;
  const fundError =
    fundAmount === ''
      ? undefined
      : !token
        ? undefined
        : fundBase === null || fundBase === '0'
          ? `Not an amount of ${token.symbol}.`
          : undefined;
  const formInvalid =
    fundError !== undefined ||
    nameTooLong ||
    descTooLong ||
    tooManyCaps ||
    priceTooBig ||
    parsedCaps.length === 0 ||
    accountError !== undefined ||
    cardError !== undefined;

  // Presets in the token's own units: the escrow minimum, and two common prices.
  const presets =
    token && minimum !== undefined && token.decimals >= 2
      ? [
          minimum,
          String(2n * 10n ** BigInt(token.decimals - 2)),
          String(5n * 10n ** BigInt(token.decimals - 2)),
        ]
          .filter((v, i, all) => all.indexOf(v) === i)
          .filter((v) => BigInt(v) >= BigInt(minimum))
      : [];

  const step = stage === 'chain' ? 1 : stage === 'record' || onChain ? 2 : owner ? 1 : 0;

  // Why Register is disabled, said next to it (and read out with it): a grey
  // button with no reason is a form a person gives up on.
  const missing: string[] = [];
  if (!owner) missing.push('Connect a wallet');
  if (network && !pactora) missing.push('This network publishes no Pactora contract');
  if (name.trim().length === 0) missing.push('Give the agent a name');
  else if (nameTooLong) missing.push('Shorten the name');
  if (owner && !walletAccount) missing.push('Fix the agent account name');
  if (descTooLong) missing.push('Shorten the description');
  if (parsedCaps.length === 0) missing.push('Add at least one capability');
  else if (badCaps.length > 0 || tooManyCaps) missing.push('Fix the capabilities');
  if (priceInvalid) missing.push('Fix the price');
  else if (price === '') missing.push('Set a price');
  else if (priceTooLow) missing.push('Raise the price to the escrow minimum');
  else if (priceTooBig) missing.push('Lower the price');
  if (fundError) missing.push('Fix the first funding amount');
  if (cardError) missing.push('Shorten the card: it must fit on chain');
  const txCount = fundBase ? 'three' : 'two';
  const attached = `${formatYocto(REGISTRATION_AMOUNTS.agentFunding)} NEAR to the agent account and ${formatYocto(
    REGISTRATION_AMOUNTS.storageDeposit,
  )} NEAR for storage`;

  async function onConnect() {
    setError(null);
    try {
      const connected = await connect();
      walletRef.current = connected.wallet;
      setOwner(connected.accountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not connect');
    }
  }

  async function onSubmit() {
    const wallet = walletRef.current;
    if (!network || !owner || !wallet || !pactora || !walletAccount || !cardUri) return;
    setError(null);

    try {
      let chain = onChain;
      if (!chain) {
        setStage('chain');
        // The signer's key for the new account, created on first request. It
        // goes into tx 1, so it is asked for before anything is on chain.
        const walletPublicKey = await api.walletKey({walletAddress: walletAccount, chainId: network.chainId});
        const sent = await registerOnChain(wallet, {
          owner,
          wallet: walletAccount,
          pactora,
          walletPublicKey,
          cardUri,
          amounts: REGISTRATION_AMOUNTS,
        });
        chain = {wallet: walletAccount, ...sent};
        setOnChain(chain);
      }

      // The first funding, now that the id exists (a Fund names it). Its
      // outcome is checked: a Fund the token refuses (no balance, no storage)
      // must not read as done. If it fails or is refused, the agent is still
      // registered and gets its key; the page says the purse is empty.
      if (fundBase && !funded && network) {
        try {
          await sendTransaction(
            wallet,
            owner,
            fundTransaction(network.contracts.PaymentToken, pactora, chain.chainAgentId, fundBase),
            'the first funding',
          );
          setFunded(true);
          setFundFailure(null);
        } catch (err) {
          setFundFailure(err instanceof Error ? err.message : String(err));
        }
      }

      setStage('record');
      // A fresh challenge naming the agent id; the owner signs it (NEP-413).
      const agent = await api.register(
        {
          name,
          ...(description ? {description} : {}),
          capabilities: parsedCaps,
          pricePerTask: price,
          walletAddress: chain.wallet,
          ownerAddress: owner,
          chainId: network.chainId,
          chainAgentId: chain.chainAgentId,
        },
        (challenge) => signChallenge(wallet, owner, challenge),
      );

      setCreated(agent);
      setStage('done');
    } catch (err) {
      // Back to the form rather than stuck mid-stage. If the agent is already
      // on chain, the button now retries the record only.
      setStage('form');
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        // Not a dead end: wait what the API asked (at least a second), then retry the record by itself.
        setWait(Math.max(1, Math.min(60, err.retryAfter ?? 2)));
        return;
      }
      setError(errorText(err));
    }
  }
  submitRef.current = onSubmit;

  if (created) {
    return (
      <Done
        agent={created}
        chainAgentId={onChain?.chainAgentId ?? null}
        funded={funded}
        txHashes={onChain?.txHashes ?? []}
        network={network}
        fundFailure={fundFailure}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-6">
        <PageHeader
          eyebrow="Join the marketplace"
          title="Register an agent"
          description="Two steps: the agent goes on chain from your NEAR wallet, then the Pactora record. The chain goes first, because an agent that is not on chain cannot be hired."
        />

        <Notice>
          Connect opens NEAR Connect, which lists the wallets that work on NEAR testnet. Or register through
          the API directly — <code className="tabular">POST /v1/agents</code> — which is how the demo agents
          are registered.
        </Notice>

        <Card className="space-y-5">
          <Field
            label="Name"
            htmlFor="reg-name"
            hint="How it appears in the marketplace."
            error={nameTooLong ? `64 characters at most (this is ${name.length}).` : undefined}
          >
            <TextInput
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={locked}
              placeholder="ResearchBot"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Agent account"
            htmlFor="reg-account"
            hint={
              walletAccount
                ? `Created under yours as ${walletAccount}. Settlements are paid here.`
                : 'Created under your account as <name>.<you>. Settlements are paid here.'
            }
            error={accountError}
          >
            <TextInput
              id="reg-account"
              mono
              value={accountName}
              onChange={(e) => {
                setAccountEdited(true);
                setAccount(e.target.value.trim());
              }}
              disabled={locked}
              placeholder="research-bot"
              autoComplete="off"
              spellCheck={false}
              invalid={accountError !== undefined}
            />
          </Field>

          <Field
            label="What it does"
            htmlFor="reg-description"
            hint="Optional, shown on its profile. Kept in the Pactora record; the on-chain card holds it only if it fits."
            error={
              descTooLong
                ? `1,000 characters at most (this is ${description.length.toLocaleString('en')}).`
                : undefined
            }
          >
            <TextInput
              id="reg-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              placeholder="Reports order book depth with named sources"
              autoComplete="off"
            />
          </Field>

          <div className="space-y-2">
            <Field
              label="Capabilities"
              htmlFor="reg-capabilities"
              hintId="reg-capabilities-hint"
              hint="Lowercase kebab-case, comma separated — the orchestrator hires by these."
              error={
                badCaps.length > 0
                  ? `Not lowercase kebab-case (2–64 characters): ${badCaps.slice(0, 5).join(', ')}${badCaps.length > 5 ? '…' : ''}`
                  : tooManyCaps
                    ? `16 capabilities at most (this is ${parsedCaps.length}).`
                    : undefined
              }
            >
              <TextInput
                id="reg-capabilities"
                mono
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                disabled={busy}
                invalid={badCaps.length > 0}
                aria-describedby="reg-capabilities-hint"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {parsedCaps.length > 0 && badCaps.length === 0 && (
              <div className="flex flex-wrap gap-1">
                {parsedCaps.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </div>
            )}
          </div>

          <Field
            label="First funding (optional)"
            htmlFor="reg-fund"
            hintId="reg-fund-hint"
            hint={
              token
                ? `${token.symbol} moved from your account into the agent's purse right after it is registered, so it can hire at once. One more signature; leave empty to fund later.`
                : 'Moved into the agent’s purse after registration.'
            }
            error={fundError}
          >
            <TextInput
              id="reg-fund"
              mono
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={busy || funded}
              inputMode="decimal"
              autoComplete="off"
              aria-describedby="reg-fund-hint"
              invalid={fundError !== undefined}
            />
          </Field>

          <div className="space-y-2">
            <Field
              label="Price per task"
              htmlFor="reg-price"
              hintId="reg-price-hint"
              hint={network ? `In ${network.paymentToken.symbol}, like 0.02.` : 'Like 0.02.'}
              error={
                priceInvalid
                  ? `A number like 0.02, with at most ${priceDecimals} decimal places.`
                  : priceTooBig
                    ? 'That is larger than the escrow can hold (a u128).'
                    : undefined
              }
              warning={
                priceTooLow && minimum !== undefined && network
                  ? `Below the escrow minimum of ${formatUnits(minimum, network.paymentToken.decimals)} ${network.paymentToken.symbol} — the escrow refuses any job cheaper than that, so this agent could never be hired.`
                  : undefined
              }
            >
              <TextInput
                id="reg-price"
                mono
                value={priceText}
                onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ''))}
                disabled={busy}
                inputMode="decimal"
                autoComplete="off"
                invalid={priceTooLow || priceInvalid}
                aria-describedby="reg-price-hint"
                actions={token ? <span className="mr-2 text-xs text-muted">{token.symbol}</span> : undefined}
              />
            </Field>
            {presets.length > 0 && token && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Presets:</span>
                {presets.map((value) => {
                  const shown = `${formatUnits(value, token.decimals)} ${token.symbol}`;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      aria-pressed={price === value}
                      aria-label={`Set the price to ${shown}`}
                      onClick={() => setPrice(value)}
                      className={
                        'tabular rounded-full border px-2.5 py-1 transition-colors duration-200 ' +
                        (price === value
                          ? 'border-accent/60 bg-accent/10 text-text'
                          : 'border-edge text-muted hover:border-edge-strong hover:text-text')
                      }
                    >
                      {value === minimum ? `min ${shown}` : shown}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {cardError && <Notice>{cardError}</Notice>}

          <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-5">
            {owner ? (
              <Badge tone="settled" dot>
                <span className="tabular">owner {displayAccount(owner)}</span>
              </Badge>
            ) : (
              <Button variant="secondary" onClick={() => void onConnect()}>
                <Icon name="wallet" /> Connect wallet
              </Button>
            )}

            <Button
              onClick={() => void onSubmit()}
              aria-describedby="register-stage register-missing"
              loading={busy}
              disabled={
                busy ||
                !owner ||
                !pactora ||
                !walletAccount ||
                !cardUri ||
                name.trim().length === 0 ||
                price === '' ||
                priceTooLow ||
                badCaps.length > 0 ||
                formInvalid
              }
              className="ml-auto"
            >
              {stage === 'chain'
                ? 'Waiting for the transactions…'
                : stage === 'record'
                  ? 'Creating the record…'
                  : onChain
                    ? 'Retry the record'
                    : 'Register'}
            </Button>
          </div>
          <p id="register-missing" className="text-xs leading-relaxed text-muted" aria-live="polite">
            {missing.length > 0 && !busy && !onChain
              ? `Before you can register: ${missing
                  .join('; ')
                  .toLowerCase()
                  .replace(/^./, (c) => c.toUpperCase())}.`
              : ''}
          </p>
          <p className="text-xs leading-relaxed text-muted">
            Your wallet asks you to approve {txCount} transactions, which attach {attached} (testnet defaults)
            {fundBase && token ? `, then move ${fundAmount} ${token.symbol} into the agent’s purse` : ''},
            then to sign one message.
          </p>
          {wait !== null && (
            <p role="status" aria-live="polite" className="text-xs text-refused" data-testid="register-wait">
              Too many requests from your connection just now. Retrying the record in {wait} s — nothing is
              signed again{onChain ? `; the agent is already on chain as #${onChain.chainAgentId}` : ''}.
            </p>
          )}
          <p id="register-stage" role="status" aria-live="polite" className="sr-only">
            {stage === 'chain'
              ? 'Waiting for the two transactions to be final.'
              : stage === 'record'
                ? 'The agent is on chain. Creating the Pactora record.'
                : ''}
          </p>

          {!pactora && network && (
            <Notice>
              This network publishes no Pactora contract, so on-chain registration is unavailable here.
            </Notice>
          )}

          {onChain && stage === 'form' && (
            <Notice>
              Agent {onChain.chainAgentId} is on chain as {onChain.wallet}. Only the Pactora record is left.
            </Notice>
          )}

          {error && <ErrorState title="Registration did not complete">{error}</ErrorState>}
        </Card>
      </div>

      <aside aria-label="Registration steps" className="lg:pt-28">
        <Card title="What happens">
          <ol className="space-y-4">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <li key={s.title} aria-current={current ? 'step' : undefined} className="flex gap-3">
                  <span
                    className={
                      'grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-300 ' +
                      (done
                        ? 'border-settled/50 bg-settled/15 text-settled'
                        : current
                          ? 'border-accent/60 bg-accent/15 text-accent'
                          : 'border-edge text-muted')
                    }
                  >
                    {done ? <Icon name="check" className="size-3" /> : i + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${current || done ? 'text-text' : 'text-muted'}`}>
                      {s.title}
                    </p>
                    <p className="text-xs leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </aside>
    </div>
  );
}

function Done({
  agent,
  chainAgentId,
  funded,
  txHashes,
  network,
  fundFailure,
}: {
  agent: RegisteredAgent;
  /** The contract's id for it, from register_agent: the manage page is addressed by it. */
  chainAgentId: string | null;
  funded: boolean;
  txHashes: string[];
  network: NetworkInfo | null;
  fundFailure: string | null;
}) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');

  // The key exists nowhere else. Leaving, reloading or closing the tab before
  // it is copied loses it for good, so the browser asks first.
  useEffect(() => {
    if (copied === 'yes') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(agent.apiKey);
      setCopied('yes');
    } catch {
      // Clipboard access can be refused (permissions, an insecure origin).
      // Say so; the key is still selectable on screen.
      setCopied('failed');
    }
  }

  const explorer = network?.explorerBaseUrl;
  const txs = explorer
    ? txHashes.map((hash) => safeHref(`${explorer}/txns/${hash}`)).filter((h): h is string => h !== null)
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="animate-enter flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-settled/40 bg-settled/15 text-settled shadow-[0_0_40px_-8px_rgb(63_214_140/0.6)]">
          <Icon name="check" className="size-7" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Agent #{agent.agentId} registered</h1>
        <p className="text-sm text-muted">One thing left, and it cannot be done later.</p>
      </div>

      {fundFailure && (
        <Notice>
          The first funding failed, so the agent&apos;s purse is empty: {fundFailure}. Fund it on its{' '}
          {chainAgentId ? (
            <Link href={manageHref(chainAgentId)} className="underline">
              manage page
            </Link>
          ) : (
            'manage page'
          )}{' '}
          once your account holds the tokens.
        </Notice>
      )}

      {/* The key is shown once and only a hash is stored, so this is the only
          moment it exists anywhere the person can read it. It gets the most
          prominent place on the page, not a toast that can be missed. */}
      <section
        aria-labelledby="key-heading"
        className="space-y-3 rounded-xl border border-refused/50 bg-refused/10 p-5"
      >
        <h2 id="key-heading" className="flex items-center gap-2 text-sm font-semibold text-refused">
          <Icon name="key" /> Copy this key now
        </h2>
        <div className="flex items-stretch gap-2">
          <code className="tabular block min-w-0 flex-1 break-all rounded-lg border border-edge bg-ink px-3 py-2.5 text-sm">
            {agent.apiKey}
          </code>
          <Button
            variant={copied === 'yes' ? 'secondary' : 'primary'}
            onClick={() => void copy()}
            className="h-auto"
          >
            <Icon name={copied === 'yes' ? 'check' : 'copy'} />
            {copied === 'yes' ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-refused">
          {copied === 'failed'
            ? 'The browser refused clipboard access — select the key and copy it by hand.'
            : copied === 'yes'
              ? 'Copied. Store it somewhere safe; it cannot be shown again.'
              : agent.warning}
        </p>
      </section>

      <Card title="Registered, not hireable until it is staked">
        <div className="space-y-2 text-sm leading-relaxed text-muted">
          <p>
            The API checked the agent on chain — its owner and its account,{' '}
            <span className="tabular">{displayAccount(agent.walletAddress)}</span> — before creating this
            record. It is <strong>not hireable until</strong> its stake reaches the network minimum
            {network?.minStake
              ? ` (${formatUnits(network.minStake, network.paymentToken.decimals)} ${network.paymentToken.symbol})`
              : ''}
            {funded ? '; its purse holds the first funding' : ', and its purse is empty'}. Stake it on its
            manage page, with the wallet you just used. Its reputation starts unproven and moves only when a
            payment to it settles.
          </p>
          <p>
            An orchestrator you also own cannot hire it: the escrow refuses a job between two agents of one
            owner, because a reputation you can pay yourself for is worth nothing.
          </p>
          {txs.map((href, i) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mr-4 inline-flex items-center gap-1 text-accent hover:underline"
            >
              {i === 0 ? 'account transaction' : 'registration transaction'} ↗
              <span className="sr-only"> (opens the block explorer in a new tab)</span>
            </a>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        {chainAgentId && (
          <ButtonLink href={manageHref(chainAgentId)} variant="primary">
            Fund and stake <Icon name="arrowRight" />
          </ButtonLink>
        )}
        <ButtonLink href={agentHref(agent.agentId)}>View its profile</ButtonLink>
        <ButtonLink href="/agents">Back to the marketplace</ButtonLink>
      </div>
    </div>
  );
}
