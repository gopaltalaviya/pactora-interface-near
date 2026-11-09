/**
 * A person's action on a job: prepare, sign, confirm.
 *
 * 1. `prepare` — the API checks the party and the state (and stores a
 *    delivery's output or a dispute's reason first), and answers the exact
 *    FunctionCall to sign.
 * 2. The wallet signs and sends it.
 * 3. `confirm` — the API reads the transaction from the chain. While the
 *    transaction is not final it answers 409 with `retryAfter`; that is
 *    waited out, for about a minute.
 *
 * Two rules the code keeps, because getting them wrong costs money or trust:
 *
 * - The wallet is asked ONCE. A transaction that was sent is never signed
 *   again: a slow confirmation, a timeout, a dropped connection all retry
 *   `confirm` with the same hash, never `prepare` and sign. (Signing twice
 *   would, for an `approve`, either fail on chain or pay twice.)
 * - The signer the API names must be the signed-in account. A mismatch is
 *   refused before the wallet is asked, not after a signature.
 * - The call the API names is checked against an allow-list (lib/wallet-guard.ts):
 *   a Pactora contract, the action's own method, this job, no deposit. The
 *   API decides WHEN an action may happen; it does not get to decide WHAT the
 *   wallet signs.
 *
 * Everything outside the module's own logic (the API calls, the wallet, the
 * clock) is injected, so the polling can be tested without waiting.
 */

import {ApiError} from './api';
import {
  isOffChain,
  market,
  type ConfirmedAction,
  type OffChainAction,
  type PersonAction,
  type PrepareExtra,
  type PreparedAction,
} from './market';
import {functionCall, sendTransaction, type NearWallet} from './wallet';
import {checkPersonCall, type Contracts, type ExpectedJob} from './wallet-guard';

/** How long `confirm` is retried before the page says it is still waiting. */
export const CONFIRM_MAX_WAIT_MS = 60_000;
/** Used when the API says "not final" without saying how long to wait. */
const DEFAULT_RETRY_MS = 2_000;

export interface PersonActionDeps {
  /** The signed-in account: the only signer this will use. */
  account: string;
  /** The session's authenticated-call wrapper (a 401 signs the tab out). */
  authed: <T>(run: (token: string) => Promise<T>) => Promise<T>;
  ensureWallet: () => Promise<NearWallet>;
  /** The network's contracts, the only receivers a prepared call may name. */
  contracts: () => Promise<Contracts>;
  api?: {
    prepare: (
      token: string,
      jobId: string,
      action: PersonAction,
      extra: PrepareExtra,
    ) => Promise<PreparedAction | OffChainAction>;
    confirm: (token: string, jobId: string, action: PersonAction, txHash: string) => Promise<ConfirmedAction>;
  };
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Plain-language progress, for a status line. */
  onStatus?: (text: string) => void;
}

/**
 * The transaction was sent, but it is not recorded yet: the chain has not
 * shown it final in the time allowed, or the API could not record it (a 5xx,
 * the network). Either way the hash is kept for a re-check; signing again
 * would only be refused on chain.
 */
export class PersonActionTimeout extends Error {
  constructor(
    readonly txHash: string,
    readonly action: PersonAction,
    message = 'The transaction was already sent, but the chain has not confirmed it yet. Do not sign again: check again in a moment.',
  ) {
    super(message);
    this.name = 'PersonActionTimeout';
  }
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `confirm`, retried while the API says the transaction is not final. Never signs. */
export async function confirmPersonAction(
  deps: PersonActionDeps,
  jobId: string,
  action: PersonAction,
  txHash: string,
): Promise<ConfirmedAction> {
  const api = deps.api ?? market;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const started = now();
  const base = 'Sent. Waiting for the chain to confirm…';
  for (;;) {
    const waited = now() - started;
    deps.onStatus?.(waited > 0 ? `${base} (${Math.round(waited / 1000)} s so far)` : base);
    try {
      const done = await deps.authed((token) => api.confirm(token, jobId, action, txHash));
      deps.onStatus?.('Done.');
      return done;
    } catch (err) {
      // The API could not record it: a 5xx, no answer, an unreadable answer
      // (lib/api.ts gives those no status), or no ApiError at all. The
      // transaction is still sent. Keep the hash for "Check again".
      if (!(err instanceof ApiError) || err.status === undefined || err.status >= 500) {
        throw new PersonActionTimeout(
          txHash,
          action,
          `The transaction was sent, but Pactora could not record it (${err instanceof Error ? err.message : String(err)}). Do not sign again: check again in a moment.`,
        );
      }
      // Only "not final yet" is waited out. A revert, a wrong party, a 401 is final.
      if (err.status !== 409 || err.retryAfter === undefined) throw err;
      const wait = err.retryAfter > 0 ? err.retryAfter * 1000 : DEFAULT_RETRY_MS;
      if (now() - started + wait > CONFIRM_MAX_WAIT_MS) throw new PersonActionTimeout(txHash, action);
      await sleep(wait);
    }
  }
}

/**
 * Prepare, sign once, confirm. Throws an error whose message is fit to show.
 * `expected` is what the page knows about the job (its chain id, its amount),
 * so the prepared call can be held against it.
 */
export async function runPersonAction(
  deps: PersonActionDeps,
  jobId: string,
  action: PersonAction,
  extra: PrepareExtra = {},
  expected: ExpectedJob = {},
): Promise<ConfirmedAction> {
  const api = deps.api ?? market;
  deps.onStatus?.('Checking the action with Pactora…');
  const [prepared, contracts] = await Promise.all([
    deps.authed((token) => api.prepare(token, jobId, action, extra)),
    deps.contracts(),
  ]);

  // Off chain (a decline): the API recorded it; there is nothing to sign and nothing to confirm.
  if (isOffChain(prepared)) {
    deps.onStatus?.('Done.');
    return {
      jobId: prepared.jobId,
      action: prepared.action,
      txHash: '',
      state: 'created',
      chainJobId: null,
      resultMismatch: false,
      explorerUrl: null,
      replayed: false,
    };
  }
  if (prepared.signerId !== deps.account) {
    throw new Error(
      `This action has to be signed by ${prepared.signerId}, but you are signed in as ${deps.account}. Nothing was sent. Sign in with the right account.`,
    );
  }
  const call = prepared.functionCall;
  // Throws UnexpectedCall, with the reason, before the wallet is opened.
  checkPersonCall(call, action, contracts, expected);

  deps.onStatus?.('Waiting for your wallet to sign…');
  const wallet = await deps.ensureWallet();
  const sent = await sendTransaction(
    wallet,
    prepared.signerId,
    {
      receiverId: call.receiverId,
      actions: [functionCall(call.methodName, call.args, {gas: call.gas, deposit: call.deposit})],
    },
    call.methodName,
  );
  if (!sent.txHash) {
    throw new Error(
      'The wallet did not return a transaction hash, so Pactora cannot confirm it. Check your wallet’s history before trying again: it may have been sent.',
    );
  }
  return confirmPersonAction(deps, jobId, action, sent.txHash);
}
