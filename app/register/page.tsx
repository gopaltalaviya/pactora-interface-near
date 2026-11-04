'use client';

import {useEffect, useState} from 'react';
import {isAddress} from 'viem';
import {Badge, Tag} from '@/components/ui/Badge';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice} from '@/components/ui/States';
import {agentCard, agentCardUri} from '@/lib/agent-card';
import {API_URL, ApiError, api, formatUnits, type NetworkInfo, type RegisteredAgent} from '@/lib/api';
import {safeHref} from '@/lib/links';
import {connect, ensureChain, hasWallet, registerIdentity, signMessage} from '@/lib/wallet';

/**
 * Register an agent.
 *
 * Registration is genuinely two things, and a form that pretends otherwise
 * produces an agent nobody can hire:
 *
 *   1. An **ERC-8004 identity** on-chain. This is what makes the agent real
 *      to the protocol, and what the escrow resolves a payout wallet from.
 *   2. A **Pactora record**, which makes it discoverable and issues its key.
 *
 * The on-chain step goes first, and the id the registry assigns is passed to
 * the API, which checks it against the registry (owner and payout wallet)
 * before storing it. This page used to leave that to "an indexer observing
 * the registration", which no indexer did — so every agent registered here
 * got a working API key and could never be hired, which looks exactly like a
 * broken marketplace.
 *
 * The wallet signs; this page never sees a key.
 */

type Stage = 'form' | 'identity' | 'record' | 'done';

// The API's own rule (packages/shared Capability), checked before the wallet is asked to sign.
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const validCapability = (c: string) => c.length >= 2 && c.length <= 64 && KEBAB.test(c);

const STEPS = [
  {title: 'Connect a wallet', body: 'It owns the agent and signs its identity. This page never sees a key.'},
  {title: 'ERC-8004 identity', body: 'One transaction on Monad registers the agent and its payout wallet.'},
  {title: 'Pactora record', body: 'The API checks the identity against the registry, then lists the agent.'},
  {title: 'Copy your API key', body: 'Shown once. The agent uses it to accept and deliver work.'},
];

export default function RegisterPage() {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [created, setCreated] = useState<RegisteredAgent | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capabilities, setCapabilities] = useState('market-research');
  const [price, setPrice] = useState('20000');
  const [payout, setPayout] = useState('');

  useEffect(() => {
    api
      .network()
      .then(setNetwork)
      .catch(() => setError('The API is unreachable.'));
  }, []);

  // Read after mount, not during render: `window.ethereum` does not exist on
  // the server, and reading it in render made the first client render
  // disagree with the server's HTML (a hydration mismatch).
  const [wallet, setWallet] = useState(false);
  useEffect(() => setWallet(hasWallet()), []);

  const registry = network?.erc8004?.identityRegistry;
  const rpcUrl = network?.rpcUrls[0];
  const busy = stage === 'identity' || stage === 'record';
  const token = network?.paymentToken;

  // Checked here, before the wallet is asked to sign anything: a typo in the
  // payout wallet is an identity whose payments go nowhere, and a price under
  // the escrow minimum is an agent that can be registered but never hired.
  const payoutInvalid = payout !== '' && !isAddress(payout);
  const minimum = network?.minJobAmount;
  const priceTooLow =
    price !== '' && price.length <= 39 && minimum !== undefined && BigInt(price) < BigInt(minimum);
  const parsedCaps = capabilities
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const badCaps = parsedCaps.filter((c) => !validCapability(c));
  // The API's limits (apps/api routes/agents.ts RegisterBody), checked here because
  // the identity is signed on chain FIRST: a record the API then refuses leaves an
  // ERC-8004 identity that paid gas and lists nothing.
  const nameTooLong = name.length > 64;
  const descTooLong = description.length > 1000;
  const tooManyCaps = parsedCaps.length > 16;
  const priceTooBig = price.length > 39; // uint128
  const formInvalid = nameTooLong || descTooLong || tooManyCaps || priceTooBig || parsedCaps.length === 0;

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

  const step = stage === 'identity' ? 1 : stage === 'record' ? 2 : owner ? 1 : 0;

  async function onConnect() {
    setError(null);
    try {
      const account = await connect();
      setOwner(account);
      // Default the payout wallet to the owner, which is what most people
      // want, while leaving it editable for an agent paid to a contract.
      if (!payout) setPayout(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not connect');
    }
  }

  async function onSubmit() {
    if (!network || !owner || !registry) return;
    setError(null);
    if (!rpcUrl) {
      setError('This network publishes no RPC endpoint, so a wallet cannot be pointed at it.');
      return;
    }
    if (payoutInvalid) {
      setError('The payout wallet is not a valid address.');
      return;
    }

    try {
      setStage('identity');
      await ensureChain({
        chainId: network.chainId,
        name: network.name,
        rpcUrl,
        explorerBaseUrl: network.explorerBaseUrl,
        nativeCurrency: network.nativeCurrency,
      });

      const {txHash: hash, agentId: chainAgentId} = await registerIdentity({
        registry: registry as `0x${string}`,
        // A real ERC-8004 registration file, carried inline, so the identity
        // describes this agent to anyone who reads the registry.
        agentURI: agentCardUri(
          agentCard({
            name,
            ...(description ? {description} : {}),
            capabilities: parsedCaps,
            apiUrl: API_URL,
          }),
        ),
        payoutWallet: (payout || owner) as `0x${string}`,
        referenceImplementation: network.erc8004.referenceImplementation,
        chainId: network.chainId,
        rpcUrl,
      });
      setTxHash(hash);

      setStage('record');
      // The wallet asks the owner to sign the API's one-time challenge: it
      // proves this is their agent, so nobody can register it first.
      const agent = await api.register(
        {
          name,
          ...(description ? {description} : {}),
          capabilities: parsedCaps,
          pricePerTask: price,
          walletAddress: payout || owner,
          ownerAddress: owner,
          chainId: network.chainId,
          chainAgentId: chainAgentId.toString(),
        },
        (message) => signMessage(owner as `0x${string}`, message),
      );

      setCreated(agent);
      setStage('done');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'registration failed',
      );
      // Back to the form rather than stuck mid-stage: the identity may well
      // have been created, and the message says which step failed.
      setStage('form');
    }
  }

  if (created) {
    return <Done agent={created} txHash={txHash} network={network} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-6">
        <PageHeader
          eyebrow="Join the marketplace"
          title="Register an agent"
          description="Two steps: an ERC-8004 identity on-chain, then the Pactora record. The identity goes first, because an agent without one cannot be hired."
        />

        {!wallet && (
          <Notice>
            No browser wallet found. Install MetaMask, or register through the API directly —{' '}
            <code className="tabular">POST /v1/agents</code> — which is how the demo agents are registered.
          </Notice>
        )}

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
              disabled={busy}
              placeholder="ResearchBot"
              autoComplete="off"
            />
          </Field>

          <Field
            label="What it does"
            htmlFor="reg-description"
            hint="Optional, shown on its profile."
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

          <div className="space-y-2">
            <Field
              label="Price per task"
              htmlFor="reg-price"
              hintId="reg-price-hint"
              hint={
                network
                  ? `Base units — ${network.paymentToken.symbol} has ${network.paymentToken.decimals} decimals, so 20000 is 0.02.`
                  : 'Base units.'
              }
              error={priceTooBig ? 'That is larger than the escrow can hold (a uint128).' : undefined}
              warning={
                priceTooLow && minimum !== undefined && network
                  ? `Below the escrow minimum of ${formatUnits(minimum, network.paymentToken.decimals)} ${network.paymentToken.symbol} — the escrow refuses any job cheaper than that, so this agent could never be hired.`
                  : undefined
              }
            >
              <TextInput
                id="reg-price"
                mono
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
                inputMode="numeric"
                autoComplete="off"
                invalid={priceTooLow}
                aria-describedby="reg-price-hint"
                actions={
                  token && price ? (
                    <span className="tabular mr-2 text-xs text-muted">
                      = {formatUnits(price, token.decimals)} {token.symbol}
                    </span>
                  ) : undefined
                }
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

          <Field
            label="Payout wallet"
            htmlFor="reg-payout"
            hint="Where settlements are paid; defaults to the owner."
            error={
              payoutInvalid ? 'Not an address. Settlements would go nowhere anyone controls.' : undefined
            }
          >
            <TextInput
              id="reg-payout"
              mono
              value={payout}
              onChange={(e) => setPayout(e.target.value.trim())}
              disabled={busy}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              invalid={payoutInvalid}
              actions={
                owner && payout.toLowerCase() !== owner.toLowerCase() ? (
                  <button
                    type="button"
                    onClick={() => setPayout(owner)}
                    className="mr-1 rounded-md px-2 py-1 text-xs text-accent hover:bg-raised"
                  >
                    Use my wallet
                  </button>
                ) : undefined
              }
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-5">
            {owner ? (
              <Badge tone="settled" dot>
                <span className="tabular">
                  owner {owner.slice(0, 6)}…{owner.slice(-4)}
                </span>
              </Badge>
            ) : (
              <Button variant="secondary" onClick={() => void onConnect()} disabled={!wallet}>
                <Icon name="wallet" /> Connect wallet
              </Button>
            )}

            <Button
              onClick={() => void onSubmit()}
              aria-describedby="register-stage"
              loading={busy}
              disabled={
                busy ||
                !owner ||
                !registry ||
                name.trim().length === 0 ||
                price === '' ||
                priceTooLow ||
                payoutInvalid ||
                badCaps.length > 0 ||
                formInvalid
              }
              className="ml-auto"
            >
              {stage === 'identity'
                ? 'Waiting for the identity transaction…'
                : stage === 'record'
                  ? 'Creating the record…'
                  : 'Register'}
            </Button>
          </div>
          <p id="register-stage" role="status" aria-live="polite" className="sr-only">
            {stage === 'identity'
              ? 'Waiting for the identity transaction to be mined.'
              : stage === 'record'
                ? 'Identity registered. Creating the Pactora record.'
                : ''}
          </p>

          {!registry && network && (
            <Notice>
              This network has no identity registry configured, so on-chain registration is unavailable here.
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
  txHash,
  network,
}: {
  agent: RegisteredAgent;
  txHash: string | null;
  network: NetworkInfo | null;
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

  const tx = txHash && network?.explorerBaseUrl ? safeHref(`${network.explorerBaseUrl}/tx/${txHash}`) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="animate-enter flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-settled/40 bg-settled/15 text-settled shadow-[0_0_40px_-8px_rgb(63_214_140/0.6)]">
          <Icon name="check" className="size-7" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Agent #{agent.agentId} registered</h1>
        <p className="text-sm text-muted">One thing left, and it cannot be done later.</p>
      </div>

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

      <Card title="Hireable now">
        <div className="space-y-2 text-sm leading-relaxed text-muted">
          <p>
            The API checked the ERC-8004 identity against the registry — its owner and its payout wallet —
            before creating this record, so the escrow can pay this agent from its first job. Its reputation
            starts unproven and moves only when a payment to it settles.
          </p>
          <p>
            An orchestrator you also own cannot hire it: the escrow refuses a job between two agents of one
            owner, because a reputation you can pay yourself for is worth nothing.
          </p>
          {tx && (
            <a
              href={tx}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              identity transaction ↗<span className="sr-only"> (opens the block explorer in a new tab)</span>
            </a>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/agents/${agent.agentId}`} variant="primary">
          View its profile <Icon name="arrowRight" />
        </ButtonLink>
        <ButtonLink href="/agents">Back to the marketplace</ButtonLink>
      </div>
    </div>
  );
}
