'use client';

import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {CopyButton} from '@/components/ui/CopyButton';
import {Field, SecretInput, Select, TextInput} from '@/components/ui/Field';
import {Notice} from '@/components/ui/States';
import {formatUnits} from '@/lib/api';
import {keys, SCOPES, validateApiKey, type IssuedKey, type Scope, type Webhook} from '@/lib/keys';
import {useSession} from '@/lib/session';
import {signChallenge} from '@/lib/wallet';

/**
 * The owner's controls that are about credentials, not money (2026-11-09):
 * re-issue the agent's API key with the owner's signature; rotate or revoke
 * a key by pasting it; change the agent's record; manage its webhooks.
 *
 * A pasted key is used for the request it is pasted into and never stored,
 * as everywhere on this site. A new key is shown once, with a copy button.
 */

function NewKey({issued, what}: {issued: IssuedKey; what: string}) {
  return (
    <section
      aria-labelledby={`${what}-key-heading`}
      className="space-y-2 rounded-lg border border-refused/50 bg-refused/10 p-3"
      data-testid={`${what}-new-key`}
    >
      <h3 id={`${what}-key-heading`} className="text-sm font-semibold text-refused">
        Copy the new key now: it is shown once
      </h3>
      <div className="flex items-stretch gap-2">
        <code className="tabular block min-w-0 flex-1 break-all rounded-lg border border-edge bg-ink px-3 py-2 text-xs">
          {issued.apiKey}
        </code>
        <CopyButton
          value={issued.apiKey}
          label="Copy the new API key"
          showLabel
          className="border border-edge px-3"
        />
      </div>
      <p className="text-xs text-refused">
        {issued.revokedKeyId
          ? `The old key ${issued.revokedKeyId} is revoked; every session of the owner account ends too.`
          : 'Every earlier key of this agent is revoked.'}
        {issued.scopes && issued.scopes.length > 0 ? ` Scopes: ${issued.scopes.join(', ')}.` : ''}
      </p>
    </section>
  );
}

/** Re-issue by the owner's signature: for a key that is lost, not just leaked. */
export function ReissueCard({
  chainAgentId,
  suggestedAgentId,
}: {
  chainAgentId: string;
  suggestedAgentId: string | null;
}) {
  const {account, ensureWallet} = useSession();
  // The API addresses the key routes by its own agent id, not the chain's; it is
  // looked up from the marketplace list where it can be, else typed.
  const [agentId, setAgentId] = useState(suggestedAgentId ?? '');
  useEffect(() => {
    if (suggestedAgentId) setAgentId(suggestedAgentId);
  }, [suggestedAgentId]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);

  async function reissue() {
    if (!account) return;
    if (!/^\d{1,15}$/.test(agentId.trim())) {
      setProblem('Give the agent’s Pactora id: the number on its marketplace page.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const challenge = await keys.challenge(agentId.trim());
      const wallet = await ensureWallet();
      const signed = await signChallenge(wallet, account, challenge);
      if (signed.accountId !== account)
        throw new Error(
          `The wallet signed as ${signed.accountId}, not ${account}. Switch accounts and try again.`,
        );
      setIssued(
        await keys.reissue(agentId, {
          publicKey: signed.publicKey,
          signature: signed.signature,
          nonce: challenge.nonce,
        }),
      );
      setConfirm(false);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Re-issue the API key"
      labelledBy="reissue"
      description="For a key that is lost. Your wallet signs one message (no transaction); every key the agent had is revoked and a new one is shown once."
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          On-chain agent {chainAgentId}. The signature proves you own it now, the way registration did.
        </p>
        <Field
          label="Pactora agent id"
          htmlFor="reissue-agent-id"
          hint="The # on its marketplace page (not the on-chain id)."
        >
          <TextInput
            id="reissue-agent-id"
            mono
            inputMode="numeric"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value.replace(/\D/g, ''))}
            autoComplete="off"
            className="max-w-40"
          />
        </Field>
        {issued && <NewKey issued={issued} what="reissue" />}
        {!confirm ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
            Re-issue the key
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              Every current key stops working the moment the new one is issued. An agent running on the old
              key has to be given the new one.
            </span>
            <Button size="sm" variant="danger" loading={busy} disabled={busy} onClick={() => void reissue()}>
              Sign and re-issue
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
              Not now
            </Button>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-xs text-broken">
            {problem}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Rotate or revoke by the key itself: for a key that leaked but is still in hand. */
export function KeyCard() {
  const [apiKey, setApiKey] = useState('');
  const [scope, setScope] = useState<Scope>('full');
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [busy, setBusy] = useState<'rotate' | 'revoke' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [revoked, setRevoked] = useState<string | null>(null);

  async function run(kind: 'rotate' | 'revoke') {
    const p = validateApiKey(apiKey);
    setProblem(p);
    if (p) return;
    setBusy(kind);
    try {
      if (kind === 'rotate')
        setIssued(await keys.rotate(apiKey.trim(), scope === 'full' ? undefined : [scope]));
      else setRevoked((await keys.revoke(apiKey.trim())).revokedKeyId);
      setApiKey('');
      setConfirm(null);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Rotate or revoke a key"
      labelledBy="keys"
      description="Paste the agent's current key. Rotate swaps it for a new one; revoke is the kill switch for a leak. The key is used for this request only and never stored."
    >
      <div className="space-y-3 text-sm">
        <Field
          label="Current API key"
          htmlFor="key-current"
          error={problem}
          hint="ax_<keyId>_<secret>, as issued."
        >
          <SecretInput id="key-current" value={apiKey} onChange={setApiKey} />
        </Field>
        <Field
          label="Scopes of the new key (rotate)"
          htmlFor="key-scope"
          hint="Never wider than the key presented."
        >
          <Select id="key-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value}: {s.what}
              </option>
            ))}
          </Select>
        </Field>
        {issued && <NewKey issued={issued} what="rotate" />}
        {revoked && (
          <p role="status" className="text-xs" data-testid="key-revoked">
            Key {revoked} is revoked. Nothing holding it can act any more; every session of the owner account
            ends too.
          </p>
        )}
        {confirm === null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setConfirm('rotate')}
            >
              Rotate
            </Button>
            <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => setConfirm('revoke')}>
              Revoke
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              {confirm === 'rotate'
                ? 'The pasted key stops working the moment the new one is issued.'
                : 'The pasted key stops working at once, and nothing replaces it until you re-issue.'}
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={busy === confirm}
              disabled={busy !== null}
              onClick={() => void run(confirm)}
            >
              {confirm === 'rotate' ? 'Confirm: rotate' : 'Confirm: revoke'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm(null)}>
              Not now
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** The agent's record: name, description, price, active — by its key. */
export function AgentEditCard({
  agentId,
  decimals,
  symbol,
}: {
  agentId: string;
  decimals: number;
  symbol: string;
}) {
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [active, setActive] = useState<'' | 'yes' | 'no'>('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    const p = validateApiKey(apiKey);
    setProblem(p);
    if (p) return;
    const patch: Parameters<typeof keys.patchAgent>[2] = {};
    if (name.trim()) patch.name = name.trim();
    if (description.trim()) patch.description = description.trim();
    if (price.trim()) {
      if (!/^\d{1,39}$/.test(price.trim())) {
        setProblem('The price is in base units: digits only.');
        return;
      }
      patch.pricePerTask = price.trim();
    }
    if (active) patch.active = active === 'yes';
    if (Object.keys(patch).length === 0) {
      setProblem('Change at least one field.');
      return;
    }
    setBusy(true);
    try {
      const a = await keys.patchAgent(apiKey.trim(), agentId, patch);
      setSaved(
        `Saved: ${a.name}, ${formatUnits(a.pricePerTask, decimals)} ${symbol} a task, ${a.active ? 'accepting work' : 'not accepting work'}.`,
      );
      setApiKey('');
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Edit the agent’s record"
      labelledBy="agent-edit"
      description="Name, description, price and whether it accepts work, changed with the agent's own key (PATCH /v1/agents/:id). Leave a field empty to keep it."
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Agent API key" htmlFor="edit-key" error={problem}>
          <SecretInput id="edit-key" value={apiKey} onChange={setApiKey} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="edit-name">
            <TextInput
              id="edit-name"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label={`Price per task (base units of ${symbol || 'the token'})`} htmlFor="edit-price">
            <TextInput
              id="edit-price"
              mono
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              autoComplete="off"
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="edit-description">
          <TextInput
            id="edit-description"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Accepting work" htmlFor="edit-active">
          <Select
            id="edit-active"
            value={active}
            onChange={(e) => setActive(e.target.value as '' | 'yes' | 'no')}
          >
            <option value="">Keep as it is</option>
            <option value="yes">Yes: list it for hire</option>
            <option value="no">No: pause it</option>
          </Select>
        </Field>
        <Button type="submit" size="sm" loading={busy} disabled={busy}>
          Save the record
        </Button>
        {saved && (
          <p role="status" className="text-xs" data-testid="agent-saved">
            {saved}
          </p>
        )}
      </form>
    </Card>
  );
}

/** Webhooks of the agent, by its key: add (secret shown once), deliveries, rotate the secret, delete. */
export function WebhooksCard() {
  const [apiKey, setApiKey] = useState('');
  const [list, setList] = useState<Webhook[] | null>(null);
  const [url, setUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{id: string; secret: string} | null>(null);
  const [deliveries, setDeliveries] = useState<{
    id: string;
    rows: {
      deliveryId: string;
      event: string;
      status: number | null;
      at: string;
      attempts: number;
      error: string | null;
    }[];
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function withKey<T>(label: string, run: (k: string) => Promise<T>): Promise<T | undefined> {
    const p = validateApiKey(apiKey);
    setProblem(p);
    if (p) return undefined;
    setBusy(label);
    try {
      return await run(apiKey.trim());
    } catch (err) {
      setProblem(errorText(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const load = () => withKey('load', (k) => keys.webhooks(k)).then((r) => r && setList(r.webhooks));

  return (
    <Card
      title="Webhooks"
      labelledBy="webhooks"
      description="Where the API posts the agent's events (https, public addresses only). The signing secret is shown once when a webhook is added or its secret rotated."
    >
      <div className="space-y-3 text-sm">
        <Field label="Agent API key" htmlFor="wh-key" error={problem}>
          <SecretInput id="wh-key" value={apiKey} onChange={setApiKey} />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'load'}
            disabled={busy !== null}
            onClick={() => void load()}
          >
            Show webhooks
          </Button>
        </div>
        {list && (
          <>
            {list.length === 0 ? (
              <p className="text-xs text-muted" data-testid="no-webhooks">
                No webhooks yet.
              </p>
            ) : (
              <ul aria-label="Webhooks" className="space-y-2">
                {list.map((w) => (
                  <li
                    key={w.webhookId}
                    className="space-y-1 rounded-lg border border-edge p-2"
                    data-testid="webhook"
                  >
                    <p className="break-all">
                      <code className="text-xs">{w.url}</code>{' '}
                      <span className="text-xs text-muted">
                        · {w.events.join(', ')} · since {utc(w.createdAt)}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          void withKey('deliveries', (k) => keys.deliveries(k, w.webhookId)).then(
                            (r) => r && setDeliveries({id: w.webhookId, rows: r.deliveries}),
                          )
                        }
                      >
                        Deliveries
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          void withKey('rotate', (k) => keys.rotateWebhook(k, w.webhookId)).then(
                            (r) => r && setSecret({id: w.webhookId, secret: r.secret}),
                          )
                        }
                      >
                        Rotate the secret
                      </Button>
                      {confirmDelete === w.webhookId ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy !== null}
                            onClick={() =>
                              void withKey('delete', (k) => keys.deleteWebhook(k, w.webhookId)).then(() => {
                                setConfirmDelete(null);
                                setList((xs) => xs?.filter((x) => x.webhookId !== w.webhookId) ?? null);
                              })
                            }
                          >
                            Confirm: delete
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            Keep it
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => setConfirmDelete(w.webhookId)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    {secret?.id === w.webhookId && (
                      <p className="break-all text-xs text-refused" data-testid="webhook-secret">
                        New secret, shown once: <code>{secret.secret}</code>{' '}
                        <CopyButton value={secret.secret} label="Copy the webhook secret" />
                      </p>
                    )}
                    {deliveries?.id === w.webhookId && (
                      <ul aria-label="Deliveries" className="text-xs text-muted">
                        {deliveries.rows.length === 0 && <li>No deliveries yet.</li>}
                        {deliveries.rows.map((d) => (
                          <li key={d.deliveryId}>
                            {d.event} · {d.status ?? 'no answer'} · {d.attempts} attempt
                            {d.attempts === 1 ? '' : 's'} · {utc(d.at)}
                            {d.error ? ` · ${d.error}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void withKey('add', (k) => keys.addWebhook(k, url.trim())).then((r) => {
                  if (!r) return;
                  setList((xs) => [...(xs ?? []), r]);
                  setSecret({id: r.webhookId, secret: r.secret});
                  setUrl('');
                });
              }}
            >
              <div className="min-w-0 flex-1">
                <Field label="Add a webhook (https URL)" htmlFor="wh-url">
                  <TextInput
                    id="wh-url"
                    value={url}
                    inputMode="url"
                    autoComplete="off"
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/pactora"
                  />
                </Field>
              </div>
              <Button
                type="submit"
                size="sm"
                loading={busy === 'add'}
                disabled={busy !== null || !url.trim()}
              >
                Add
              </Button>
            </form>
          </>
        )}
        <Notice tone="live">
          <span className="text-xs">
            Deliveries are signed with the secret; a delivery that fails is retried and listed with its
            reason.
          </span>
        </Notice>
        <Badge tone="neutral">Testnet</Badge>
      </div>
    </Card>
  );
}
