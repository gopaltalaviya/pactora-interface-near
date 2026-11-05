/**
 * The owner's NEAR wallet, via NEAR Connect (`@hot-labs/near-connect`, pinned
 * to 0.12.0).
 *
 * ## Why this connector
 *
 * docs.near.org's wallet-login tutorial uses NEAR Connect and nothing else
 * (https://docs.near.org/web3-apps/tutorials/wallet-login, read 2026-11-05).
 * It has no runtime dependencies and needs no WalletConnect project id: each
 * wallet's code runs in a sandboxed iframe, loaded from the wallet's own
 * manifest entry, so this page ships no wallet code of its own.
 *
 * The page asks three things of a wallet, and only these:
 *
 *   1. connect — which account is the owner;
 *   2. two transactions (NEAR-PORT §5) — create the agent's account with a
 *      key the signer holds, scoped to Pactora, then `register_agent`;
 *   3. a NEP-413 signature over the API's one-time challenge.
 *
 * Nothing here ever sees a private key. The wallet signs; this code asks.
 *
 * TESTNET ONLY. The connector is opened on `testnet`, and the amounts below
 * are testnet defaults.
 */

import type {NearConnector} from '@hot-labs/near-connect';
import {isAccountId} from './near';

// ─── amounts ───────────────────────────────────────────────────────────────

/**
 * What registration attaches, in yoctoNEAR (1 NEAR = 10^24). TESTNET
 * DEFAULTS, each overridable by a public env var of the same purpose:
 *
 * - `storageDeposit` (0.1 NEAR) goes with `register_agent`. The contract takes
 *   the storage the agent's records use and keeps the rest as the agent's
 *   storage balance for future jobs (`InsufficientStorage` if it is short).
 *   `NEXT_PUBLIC_REGISTER_STORAGE_DEPOSIT_YOCTO`.
 * - `agentFunding` (0.5 NEAR) is transferred to the new agent account: its gas
 *   money, since every call the signer makes for it is paid by it.
 *   `NEXT_PUBLIC_REGISTER_AGENT_FUNDING_YOCTO`.
 * - `keyAllowance` (0.25 NEAR) caps the gas the signer's function-call key may
 *   ever spend. A function-call key cannot attach a deposit, so this bounds
 *   what a leaked signer key can cost. `NEXT_PUBLIC_REGISTER_KEY_ALLOWANCE_YOCTO`.
 */
export const TESTNET_DEFAULTS = {
  storageDeposit: '100000000000000000000000',
  agentFunding: '500000000000000000000000',
  keyAllowance: '250000000000000000000000',
} as const;

export type RegistrationAmounts = {storageDeposit: string; agentFunding: string; keyAllowance: string};

const yocto = (value: string | undefined, fallback: string) =>
  value && /^[1-9]\d{0,38}$/.test(value.trim()) ? value.trim() : fallback;

/** The amounts this build uses: the env overrides where valid, the testnet defaults otherwise. */
export const REGISTRATION_AMOUNTS: RegistrationAmounts = {
  storageDeposit: yocto(
    process.env['NEXT_PUBLIC_REGISTER_STORAGE_DEPOSIT_YOCTO'],
    TESTNET_DEFAULTS.storageDeposit,
  ),
  agentFunding: yocto(process.env['NEXT_PUBLIC_REGISTER_AGENT_FUNDING_YOCTO'], TESTNET_DEFAULTS.agentFunding),
  keyAllowance: yocto(process.env['NEXT_PUBLIC_REGISTER_KEY_ALLOWANCE_YOCTO'], TESTNET_DEFAULTS.keyAllowance),
};

/** 100 Tgas for `register_agent`, the same budget the signer gives every call (NEAR-PORT §6). */
export const REGISTER_GAS = '100000000000000';

// ─── the wallet surface this page uses ─────────────────────────────────────

type Action =
  | {type: 'CreateAccount'}
  | {type: 'Transfer'; params: {deposit: string}}
  | {
      type: 'AddKey';
      params: {
        publicKey: string;
        accessKey: {permission: {receiverId: string; methodNames: string[]; allowance: string}};
      };
    }
  | {
      type: 'FunctionCall';
      params: {methodName: string; args: Record<string, unknown>; gas: string; deposit: string};
    };

export interface Transaction {
  receiverId: string;
  actions: Action[];
}

/** The part of NEAR Connect's `NearWalletBase` this page calls. */
export interface NearWallet {
  getAccounts(data?: {network?: 'testnet'}): Promise<{accountId: string}[]>;
  signAndSendTransactions(params: {
    network?: 'testnet';
    signerId?: string;
    transactions: Transaction[];
  }): Promise<unknown[]>;
  signMessage(params: {
    message: string;
    recipient: string;
    nonce: Uint8Array;
    network?: 'testnet';
    signerId?: string;
  }): Promise<SignedMessage>;
}

export interface SignedMessage {
  accountId: string;
  publicKey: string;
  signature: string;
}

// ─── connecting ────────────────────────────────────────────────────────────

let connector: Promise<NearConnector> | null = null;

/**
 * One connector per page, created on first use: NEAR Connect touches
 * `window` and IndexedDB, which do not exist during the server render.
 */
function getConnector(): Promise<NearConnector> {
  connector ??= import('@hot-labs/near-connect').then(
    ({NearConnector}) =>
      new NearConnector({
        network: 'testnet',
        providers: {testnet: ['https://rpc.testnet.near.org']},
        // Only wallets that can do everything registration needs, on testnet.
        features: {signMessage: true, signAndSendTransactions: true, testnet: true},
        // EVM accounts through a NEAR shim cannot create `<name>.<owner>`.
        excludedWallets: ['ethereum-wallets'],
      }),
  );
  return connector;
}

/** Open the wallet picker; resolve with the owner's account id. */
export async function connect(): Promise<{accountId: string; wallet: NearWallet}> {
  const c = await getConnector();
  const wallet = (await c.connect()) as unknown as NearWallet;
  const [account] = await wallet.getAccounts({network: 'testnet'});
  if (!account) throw new Error('The wallet returned no account.');
  return {accountId: account.accountId, wallet};
}

export async function disconnect(): Promise<void> {
  if (!connector) return;
  await (await connector).disconnect().catch(() => undefined);
}

// ─── registration (NEAR-PORT §5) ───────────────────────────────────────────

const ED25519 = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface RegistrationInput {
  owner: string;
  /** `<name>.<owner>`: only the owner can create it. */
  wallet: string;
  /** The Pactora contract account, from `GET /v1/network` `contracts.Pactora`. */
  pactora: string;
  /** From `POST /v1/agents/challenge`: the key the signer holds for `wallet`. */
  walletPublicKey: string;
  cardUri: string;
  perTaskCap?: string;
  dailyCap?: string;
  amounts: RegistrationAmounts;
}

/**
 * tx 1 to the agent's account: create it, fund it, give the signer a key
 * that can call Pactora and nothing else (`methodNames: []` means any method
 * on that one receiver; the contract decides who may call what).
 * tx 2 to Pactora: `register_agent`, with the storage deposit.
 */
export function registrationTransactions(input: RegistrationInput): [Transaction, Transaction] {
  return [
    {
      receiverId: input.wallet,
      actions: [
        {type: 'CreateAccount'},
        {type: 'Transfer', params: {deposit: input.amounts.agentFunding}},
        {
          type: 'AddKey',
          params: {
            publicKey: input.walletPublicKey,
            accessKey: {
              permission: {receiverId: input.pactora, methodNames: [], allowance: input.amounts.keyAllowance},
            },
          },
        },
      ],
    },
    {
      receiverId: input.pactora,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'register_agent',
            args: {
              wallet: input.wallet,
              card_uri: input.cardUri,
              ...(input.perTaskCap ? {per_task_cap: input.perTaskCap} : {}),
              ...(input.dailyCap ? {daily_cap: input.dailyCap} : {}),
            },
            gas: REGISTER_GAS,
            deposit: input.amounts.storageDeposit,
          },
        },
      ],
    },
  ];
}

function failure(outcome: unknown): string | null {
  const status = (outcome as {status?: unknown} | undefined)?.status;
  if (status && typeof status === 'object' && 'Failure' in status) {
    return JSON.stringify((status as {Failure: unknown}).Failure);
  }
  if (status === 'Failure') return 'Failure';
  return null;
}

/**
 * The `AgentId` (u64) `register_agent` returned: `status.SuccessValue` is the
 * base64 of its JSON. Read as text, not `JSON.parse`, so an id past 2^53 stays
 * exact.
 */
export function agentIdFromOutcome(outcome: unknown): string {
  if (!outcome) throw new Error('the wallet returned no outcome for register_agent');
  const failed = failure(outcome);
  if (failed) throw new Error(`register_agent failed: ${failed}`);
  const value = (outcome as {status?: {SuccessValue?: string}}).status?.SuccessValue;
  if (typeof value !== 'string') throw new Error('register_agent returned no value');
  const text = atob(value).trim();
  const match = /^"?(\d{1,20})"?$/.exec(text);
  if (!match) throw new Error(`register_agent returned ${text || 'nothing'}, not an agent id`);
  return match[1]!;
}

/** Send both registration transactions as the owner; resolve with the new agent id. */
export async function registerOnChain(
  wallet: NearWallet,
  input: RegistrationInput,
): Promise<{chainAgentId: string; txHashes: string[]}> {
  // Checked before the wallet is asked anything: a malformed value is either
  // refused by the wallet with an opaque message or, worse, signed.
  if (!isAccountId(input.owner)) throw new Error(`the owner is not a NEAR account id: ${input.owner}`);
  if (!isAccountId(input.wallet) || !input.wallet.endsWith(`.${input.owner}`)) {
    throw new Error(`the agent account must be a sub-account of ${input.owner}: ${input.wallet}`);
  }
  if (!isAccountId(input.pactora))
    throw new Error(`the Pactora contract account is invalid: ${input.pactora}`);
  if (!ED25519.test(input.walletPublicKey)) {
    throw new Error(`the signer key is not an ed25519 public key: ${input.walletPublicKey}`);
  }

  const outcomes = await wallet.signAndSendTransactions({
    network: 'testnet',
    signerId: input.owner,
    transactions: registrationTransactions(input),
  });
  const created = failure(outcomes[0]);
  if (created) throw new Error(`creating ${input.wallet} failed: ${created}`);
  const txHashes = outcomes
    .map((o) => (o as {transaction?: {hash?: unknown}} | undefined)?.transaction?.hash)
    .filter((h): h is string => typeof h === 'string');
  return {chainAgentId: agentIdFromOutcome(outcomes[1]), txHashes};
}

// ─── NEP-413 ───────────────────────────────────────────────────────────────

/** The API's nonce, 64 hex characters, as the 32 bytes NEP-413 requires. */
export function nonceBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex))
    throw new Error('the challenge nonce must be 32 bytes (64 hex characters)');
  return Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
}

/**
 * Sign the API's one-time challenge (NEP-413). The API then checks the
 * signature, that `publicKey` is a full-access key of the owner, and the
 * agent on chain (NEAR-PORT §5 a–c).
 */
export async function signChallenge(
  wallet: NearWallet,
  owner: string,
  challenge: {message: string; recipient: string; nonce: string},
): Promise<SignedMessage> {
  return wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: nonceBytes(challenge.nonce),
    network: 'testnet',
    signerId: owner,
  });
}
