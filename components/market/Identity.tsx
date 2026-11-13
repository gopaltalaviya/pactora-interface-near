'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {Notice} from '@/components/ui/States';
import {
  canStart,
  kyc,
  simulatedSessionOf,
  STANDING_WORDS,
  STATUS_WORDS,
  validateLegalName,
  type KycStart,
  type KycState,
} from '@/lib/kyc';
import {IDENTITY_OPTIONAL_NOTE, identitySkipped, setIdentitySkipped} from '@/lib/identity-skip';
import {useSession} from '@/lib/session';

/**
 * A person's identity check and standing (docs/26 F13, F14). The legal name
 * is screened against the sanctions lists before any identity session; a
 * simulated provider is labelled as such, because it checks no document.
 * The check is optional: nothing on Pactora requires it (the API gates on
 * standing only), so a person can skip it and come back (lib/identity-skip).
 */
export function IdentityCard() {
  const {authed, account} = useSession();
  const [skipped, setSkipped] = useState(false);
  const [state, setState] = useState<KycState | null>(null);
  const [name, setName] = useState('');
  const [started, setStarted] = useState<KycStart | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => kyc.state(t, controller.signal))
      .then(setState)
      .catch(() => {
        if (!controller.signal.aborted) setState(null);
      });
    return () => controller.abort();
  }, [authed, attempt]);

  useEffect(() => {
    setSkipped(account ? identitySkipped(account) : false);
  }, [account]);

  if (!state) return null;

  function skip(next: boolean) {
    if (account) setIdentitySkipped(account, next);
    setSkipped(next);
  }

  async function begin() {
    const p = validateLegalName(name);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      setStarted(await authed((t) => kyc.start(t, name.trim())));
      setAttempt((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const session = simulatedSessionOf(started?.url);
  const v = state.verification;
  const steps = (
    <>
      {v && (
        <p data-testid="kyc-status">
          Check: {STATUS_WORDS[v.status]}
          {v.status === 'approved' && v.documentVerified && ' An identity document was verified.'}
        </p>
      )}
      {!state.provider && <p className="text-muted">Identity checks are not available on this server.</p>}
      {state.provider?.simulated && (
        <Notice>
          <span data-testid="simulated-notice">
            This server uses a <strong>simulated</strong> identity provider for testing: no document is looked
            at, and a &quot;verified&quot; result here proves nothing about who you are.
          </span>
        </Notice>
      )}
      {session && (
        <p>
          <Link href={`/kyc/simulated?session=${session}`} className="text-accent underline">
            Continue to the simulated identity check
          </Link>
        </p>
      )}
      {canStart(state) && !session && (
        <form className="space-y-2" aria-label="Start an identity check" onSubmit={(e) => e.preventDefault()}>
          <Field
            label="Full legal name"
            htmlFor="kyc-name"
            error={problem}
            hint="As on your identity document."
          >
            <TextInput id="kyc-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button icon="shield" size="sm" disabled={busy} loading={busy} onClick={() => void begin()}>
              Start the identity check
            </Button>
            {!v && (
              <Button icon="arrowRight" size="sm" variant="ghost" onClick={() => skip(true)}>
                Skip for now
              </Button>
            )}
          </div>
        </form>
      )}
    </>
  );

  return (
    <Card
      title="Identity check"
      labelledBy="identity"
      actions={
        <span className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">Optional</Badge>
          {state.provider?.simulated && <Badge tone="refused">Simulated provider</Badge>}
        </span>
      }
      description="Optional. If you start a check, your legal name is screened against public sanctions lists first. Nothing on Pactora needs it: posting, bidding, hiring and getting paid all work without one; a close sanctions match puts the account on hold."
    >
      <div className="space-y-3 text-sm">
        <p data-testid="standing">
          Standing: <strong>{STANDING_WORDS[state.standing]}</strong>
        </p>
        <Notice>
          <span data-testid="identity-optional-note">
            <strong>For judges and testers:</strong> {IDENTITY_OPTIONAL_NOTE}
          </span>
        </Notice>
        {skipped ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="identity-skipped">
            <span className="text-muted">You skipped the identity check. You can verify any time.</span>
            <Button icon="shield" size="sm" variant="secondary" onClick={() => skip(false)}>
              Verify now
            </Button>
          </div>
        ) : (
          steps
        )}
        <p className="text-xs text-muted" data-testid="wallet-screening">
          NEAR wallets: {state.walletScreening}.
        </p>
      </div>
    </Card>
  );
}

/** The simulated provider's page: a person picks the outcome. Testnet only, and it says so. */
export function SimulatedCheck({sessionId}: {sessionId: string}) {
  const {authed} = useSession();
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function complete(outcome: 'approved' | 'rejected', documentVerified: boolean) {
    setProblem(null);
    try {
      const r = await authed((t) => kyc.completeSimulated(t, sessionId, outcome, documentVerified));
      setDone(r.status);
    } catch (err) {
      setProblem(errorText(err));
    }
  }

  return (
    <div className="space-y-4">
      <Notice>
        <strong>Simulated identity check.</strong> Nothing is uploaded and no document is checked. This exists
        so the flow can be tried on testnet; a real provider replaces it.
      </Notice>
      {done ? (
        <p role="status" data-testid="simulated-done">
          Recorded: {STATUS_WORDS[done as keyof typeof STATUS_WORDS] ?? done}{' '}
          <Link href="/me" className="underline">
            Back to my account
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void complete('approved', true)}>Simulate: document verified</Button>
          <Button variant="secondary" onClick={() => void complete('approved', false)}>
            Simulate: approved without a document
          </Button>
          <Button variant="danger" onClick={() => void complete('rejected', false)}>
            Simulate: rejected
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-broken">
          {problem}
        </p>
      )}
      <Notice>
        <span data-testid="identity-optional-note">
          <strong>For judges and testers:</strong> {IDENTITY_OPTIONAL_NOTE}
        </span>
      </Notice>
    </div>
  );
}
