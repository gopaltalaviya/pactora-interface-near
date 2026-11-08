'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {ApiError, api, type PersonRef} from './api';
import {connect, disconnect, signChallenge, type NearWallet} from './wallet';

/**
 * Who is signed in on this tab.
 *
 * A session is the API's `ps_…` bearer token, obtained by signing a NEP-413
 * challenge with the account's wallet. It is kept in `sessionStorage`: it
 * dies with the tab, which is the right lifetime for a bearer secret in a page
 * that runs wallet code; `localStorage` would hand it to the next visitor on a
 * shared machine. Every storage access is wrapped, because a private window or
 * blocked site data makes it throw, and the page must work without it.
 *
 * The wallet object cannot be stored. After a reload the session survives but
 * the wallet connection is not in memory: `ensureWallet` reconnects when a page
 * actually needs to sign a transaction, and refuses an account that is not the
 * signed-in one.
 */

export const SESSION_KEY = 'pactora.session';

interface Stored {
  token: string;
  account: string;
  expiresAt: string;
}

function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return typeof v.token === 'string' && typeof v.account === 'string' && typeof v.expiresAt === 'string'
      ? {token: v.token, account: v.account, expiresAt: v.expiresAt}
      : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null): void {
  try {
    if (value) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the session lasts until the page is closed */
  }
}

export type SessionStatus = 'loading' | 'out' | 'in';

export interface SessionValue {
  status: SessionStatus;
  account: string | null;
  person: PersonRef | null;
  expiresAt: string | null;
  /** The wallet connected in this page load, if any. */
  wallet: NearWallet | null;
  /** Connect, challenge, sign, create the session. Throws a readable error. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** The wallet for the signed-in account, reconnecting if the page was reloaded. */
  ensureWallet: () => Promise<NearWallet>;
  /** Run an authenticated call. A 401 signs this tab out and rethrows. */
  authed: <T>(run: (token: string) => Promise<T>) => Promise<T>;
  /** Re-read the person record from the API. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}

export function SessionProvider({children}: {children: ReactNode}) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [stored, setStored] = useState<Stored | null>(null);
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [wallet, setWallet] = useState<NearWallet | null>(null);
  const walletRef = useRef<NearWallet | null>(null);
  const tokenRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    writeStored(null);
    tokenRef.current = null;
    setStored(null);
    setPerson(null);
    setStatus('out');
  }, []);

  // Restore on load, and ask the API whether the token is still good.
  useEffect(() => {
    const found = readStored();
    if (!found) {
      setStatus('out');
      return;
    }
    const controller = new AbortController();
    tokenRef.current = found.token;
    api
      .getSession(found.token, controller.signal)
      .then((info) => {
        setStored({...found, account: info.account, expiresAt: info.expiresAt});
        setPerson(info.person);
        setStatus('in');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Only a refusal ends the session. An unreachable API must not sign
        // anyone out: the token may be perfectly good.
        if (err instanceof ApiError && (err.code === 'UNAUTHORIZED' || err.code === 'WRONG_CREDENTIAL')) {
          clear();
        } else {
          setStored(found);
          setStatus('in');
        }
      });
    return () => controller.abort();
  }, [clear]);

  const authed = useCallback(
    async function authedCall<T>(run: (token: string) => Promise<T>): Promise<T> {
      const token = tokenRef.current;
      if (!token) throw new ApiError('UNAUTHORIZED', 'You are not signed in.');
      try {
        return await run(token);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'UNAUTHORIZED') clear();
        throw err;
      }
    },
    [clear],
  );

  const signIn = useCallback(async () => {
    const connected = await connect();
    walletRef.current = connected.wallet;
    setWallet(connected.wallet);
    const session = await api.createSession({accountId: connected.accountId}, (challenge) =>
      signChallenge(connected.wallet, connected.accountId, challenge),
    );
    const next = {token: session.token, account: session.account, expiresAt: session.expiresAt};
    writeStored(next);
    tokenRef.current = session.token;
    setStored(next);
    setPerson(session.person);
    setStatus('in');
  }, []);

  const finishSignOut = useCallback(async () => {
    clear();
    walletRef.current = null;
    setWallet(null);
    await disconnect();
  }, [clear]);

  const signOut = useCallback(async () => {
    const token = tokenRef.current;
    try {
      if (token) await api.deleteSession(token);
    } catch (err) {
      // Already gone on the server is as good as signed out; anything else is
      // reported, and the session is kept so the person can try again.
      if (!(err instanceof ApiError && err.code === 'UNAUTHORIZED')) throw err;
    }
    await finishSignOut();
  }, [finishSignOut]);

  const signOutEverywhere = useCallback(async () => {
    const token = tokenRef.current;
    try {
      if (token) await api.deleteAllSessions(token);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'UNAUTHORIZED')) throw err;
    }
    await finishSignOut();
  }, [finishSignOut]);

  const ensureWallet = useCallback(async () => {
    if (walletRef.current) return walletRef.current;
    const account = stored?.account;
    if (!account) throw new Error('Sign in first.');
    const connected = await connect();
    if (connected.accountId !== account) {
      throw new Error(
        `The wallet is connected as ${connected.accountId}, not ${account}. Switch accounts and try again.`,
      );
    }
    walletRef.current = connected.wallet;
    setWallet(connected.wallet);
    return connected.wallet;
  }, [stored]);

  const refresh = useCallback(async () => {
    const info = await authed((token) => api.getSession(token));
    setPerson(info.person);
  }, [authed]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      account: stored?.account ?? null,
      person,
      expiresAt: stored?.expiresAt ?? null,
      wallet,
      signIn,
      signOut,
      signOutEverywhere,
      ensureWallet,
      authed,
      refresh,
    }),
    [status, stored, person, wallet, signIn, signOut, signOutEverywhere, ensureWallet, authed, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
