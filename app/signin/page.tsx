'use client';

import {useState} from 'react';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {ApiError} from '@/lib/api';
import {displayAccount} from '@/lib/near';
import {useSession} from '@/lib/session';

/**
 * Sign in with a NEAR account.
 *
 * The wallet signs one message (NEP-413): proof that you hold a full-access
 * key of the account. No transaction, no fee, nothing leaves the wallet but a
 * signature. The API answers with a session token that this tab keeps until it
 * is closed or you sign out.
 */

const message = (err: unknown) =>
  err instanceof ApiError
    ? `${err.code}: ${err.message}`
    : err instanceof Error
      ? err.message
      : 'something went wrong';

export default function SignInPage() {
  const session = useSession();
  const [busy, setBusy] = useState<null | 'in' | 'out' | 'all'>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'in' | 'out' | 'all', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Sign in"
        description="Prove you own a NEAR account by signing a message in your wallet. There is no transaction and no fee."
      />

      {error && <ErrorState title="Could not complete that">{error}</ErrorState>}

      {session.status === 'loading' ? (
        <Card>
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : session.status === 'in' && session.account ? (
        <Card title="You are signed in" labelledBy="signed-in">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Account</dt>
              <dd className="tabular break-all" data-testid="signed-in-account">
                {displayAccount(session.account)}
              </dd>
            </div>
            {session.expiresAt && (
              <div>
                <dt className="text-muted">Session ends</dt>
                <dd className="tabular">{new Date(session.expiresAt).toUTCString()}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted">Person record</dt>
              <dd>{session.person ? session.person.name : 'None yet'}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {session.person ? (
              <ButtonLink href={`/agents/${session.person.chainAgentId}/manage`} size="sm">
                Fund and stake
              </ButtonLink>
            ) : (
              <ButtonLink href="/join" size="sm">
                Join as a person
              </ButtonLink>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'out'}
              disabled={busy !== null}
              onClick={() => run('out', session.signOut)}
            >
              Sign out
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === 'all'}
              disabled={busy !== null}
              onClick={() => run('all', session.signOutEverywhere)}
            >
              Sign out everywhere
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Sign out ends this tab’s session. Sign out everywhere ends every session of this account, on every
            device.
          </p>
        </Card>
      ) : (
        <Card title="Connect a wallet" labelledBy="connect">
          <div className="space-y-4 text-sm text-muted">
            <p>
              Connect opens NEAR Connect, which lists the wallets that work on NEAR testnet. The wallet then
              asks you to sign a short message. This page never sees a key.
            </p>
            <Button
              loading={busy === 'in'}
              disabled={busy !== null}
              onClick={() => run('in', session.signIn)}
            >
              Connect and sign in
            </Button>
          </div>
        </Card>
      )}

      <Notice tone="live">Pactora runs on NEAR testnet only. Signing in does not move any money.</Notice>
    </div>
  );
}
