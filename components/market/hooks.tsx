'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Skeleton} from '@/components/ui/States';
import {api, type NetworkInfo} from '@/lib/api';
import {errorText} from '@/lib/errors';
import {market, type ConfirmedAction, type Me, type PersonAction, type PrepareExtra} from '@/lib/market';
import {confirmPersonAction, PersonActionTimeout, runPersonAction} from '@/lib/person-action';
import {useSession} from '@/lib/session';
import {signInHref} from '@/lib/signin-next';
import type {ExpectedJob} from '@/lib/wallet-guard';

/** An error as one sentence a person can read (lib/errors.ts). */
export {errorText};

/** What the pages need from GET /v1/network: the token's units, the explorer, the windows. */
export interface TokenInfo {
  decimals: number;
  symbol: string;
  explorer: string | null;
  minJobAmount: string | undefined;
  maxJobAmount: string | undefined;
  network: NetworkInfo;
}

let networkOnce: Promise<NetworkInfo> | null = null;

/** GET /v1/network, fetched once per page load and shared; a failure is forgotten so the next ask retries. */
export function networkPromise(): Promise<NetworkInfo> {
  networkOnce ??= api.network().catch((err: unknown) => {
    networkOnce = null;
    throw err;
  });
  return networkOnce;
}

/** The network facts, fetched once per page load. `null` while loading or if it failed. */
export function useNetwork(): TokenInfo | null {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  useEffect(() => {
    let live = true;
    networkPromise()
      .then((n) => live && setNetwork(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return useMemo(
    () =>
      network
        ? {
            decimals: network.paymentToken.decimals,
            symbol: network.paymentToken.symbol,
            explorer: network.explorerBaseUrl,
            minJobAmount: network.minJobAmount,
            maxJobAmount: network.maxJobAmount,
            network,
          }
        : null,
    [network],
  );
}

/** `GET /v1/me` for the signed-in person (none while signed out). */
export function useMe(): {me: Me | null; error: string | null; reload: () => void} {
  const session = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const {status, authed} = session;
  useEffect(() => {
    if (status !== 'in') {
      setMe(null);
      return;
    }
    const controller = new AbortController();
    setError(null);
    authed((token) => market.me(token, controller.signal))
      .then(setMe)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [status, authed, attempt]);
  return {me, error, reload: () => setAttempt((n) => n + 1)};
}

/** The sign-in link that brings a person back to the page they are on. */
export function useSignInHref(): string {
  const pathname = usePathname();
  return signInHref(pathname);
}

/** A page that needs a session says so, and where to get one. */
export function SignInGate({what, children}: {what: string; children: React.ReactNode}) {
  const {status} = useSession();
  const href = useSignInHref();
  if (status === 'loading') {
    return (
      <div role="status" aria-label="Checking your session" className="space-y-3">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (status === 'out') {
    return (
      <Card title="Sign in first" labelledBy="gate">
        <p className="text-sm text-muted">
          Sign in with your NEAR account to {what}. It takes one signature and no fee.
        </p>
        <div className="mt-4">
          <Link
            href={href}
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-ink"
          >
            Sign in
          </Link>
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}

export interface ActionState {
  busy: boolean;
  /** Progress, in words. Stays after a failure so the person sees how far it got. */
  status: string | null;
  error: string | null;
  /** A sent transaction the chain has not confirmed yet: confirm again, never sign again. */
  pending: {jobId: string; action: PersonAction; txHash: string} | null;
  done: ConfirmedAction | null;
}

const IDLE: ActionState = {busy: false, status: null, error: null, pending: null, done: null};

/** `runPersonAction` for a page: busy, progress, error, and the re-check after a timeout. */
export function usePersonAction(onDone?: (result: ConfirmedAction) => void) {
  const session = useSession();
  const [state, setState] = useState<ActionState>(IDLE);
  const latest = useRef({session, onDone});
  latest.current = {session, onDone};

  const deps = useCallback(() => {
    const s = latest.current.session;
    if (!s.account) throw new Error('Sign in first.');
    return {
      account: s.account,
      authed: s.authed,
      ensureWallet: s.ensureWallet,
      // The contracts a prepared call may name, from the network the page already shows.
      contracts: async () => (await networkPromise()).contracts,
      onStatus: (status: string) => setState((prev) => ({...prev, status})),
    };
  }, []);

  const finish = useCallback((result: ConfirmedAction) => {
    setState({busy: false, status: 'Done.', error: null, pending: null, done: result});
    latest.current.onDone?.(result);
  }, []);

  const fail = useCallback((err: unknown, jobId: string, action: PersonAction) => {
    setState((prev) => ({
      ...prev,
      busy: false,
      error: errorText(err),
      pending: err instanceof PersonActionTimeout ? {jobId, action, txHash: err.txHash} : prev.pending,
    }));
  }, []);

  /** `expected` is what the page knows about the job, held against the call the API prepares. */
  const run = useCallback(
    async (jobId: string, action: PersonAction, extra: PrepareExtra = {}, expected: ExpectedJob = {}) => {
      setState({...IDLE, busy: true});
      try {
        finish(await runPersonAction(deps(), jobId, action, extra, expected));
      } catch (err) {
        fail(err, jobId, action);
      }
    },
    [deps, finish, fail],
  );

  /** Ask again about a transaction that was already sent. Never signs. */
  const recheck = useCallback(async () => {
    const pending = state.pending;
    if (!pending) return;
    setState((prev) => ({...prev, busy: true, error: null}));
    try {
      finish(await confirmPersonAction(deps(), pending.jobId, pending.action, pending.txHash));
    } catch (err) {
      fail(err, pending.jobId, pending.action);
    }
  }, [state.pending, deps, finish, fail]);

  const reset = useCallback(() => setState(IDLE), []);

  return {state, run, recheck, reset};
}

/** The status line, the error and the "check again" button for a `usePersonAction`. */
export function ActionFeedback({state, recheck}: {state: ActionState; recheck: () => void}) {
  return (
    <div aria-live="polite" className="space-y-2 text-sm">
      {state.status && !state.error && (
        <p role="status" className="text-muted" data-testid="action-status">
          {state.status}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-broken" data-testid="action-error">
          {state.error}
        </p>
      )}
      {state.pending && !state.busy && (
        <Button size="sm" variant="secondary" onClick={recheck}>
          Check again
        </Button>
      )}
    </div>
  );
}
