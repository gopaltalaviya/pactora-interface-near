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
 *   2. two transactions (NEAR-WIRE §5) — create the agent's account with a
 *      key the signer holds, scoped to Pactora, then `register_agent`;
 *   3. a NEP-413 signature over the API's one-time challenge.
 *
 * Nothing here ever sees a private key. The wallet signs; this code asks.
 *
 * TESTNET ONLY. The connector is opened on `testnet`, and the amounts below
 * are testnet defaults.
 */

import type {NearConnector} from '@hot-labs/near-connect';
import {agentIdArg, isAccountId} from './near';

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

/** 100 Tgas for `register_agent`, the same budget the signer gives every call (NEAR-WIRE §6). */
export const REGISTER_GAS = '100000000000000';

// ─── the wallet surface this page uses ─────────────────────────────────────

export type Action =
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

// ─── generic builders ──────────────────────────────────────────────────────

/** The one yoctoNEAR a contract's `assert_one_yocto` asks for: it forces a full-access key, so a leaked agent key cannot call it. */
export const ONE_YOCTO = '1';

/** 100 Tgas, the budget the signer gives every call. */
export const DEFAULT_GAS = REGISTER_GAS;
/** 150 Tgas: `ft_transfer_call` runs the token, then the receiver's `ft_on_transfer`, then a resolve. */
export const FT_TRANSFER_CALL_GAS = '150000000000000';

/** A `FunctionCall` action. `deposit` is a yoctoNEAR decimal string; it defaults to none. */
export function functionCall(
  methodName: string,
  args: Record<string, unknown>,
  options: {gas?: string; deposit?: string} = {},
): Action {
  const deposit = options.deposit ?? '0';
  const gas = options.gas ?? DEFAULT_GAS;
  // Checked before a wallet is asked: both end up in a signed transaction.
  if (!/^(0|[1-9]\d{0,38})$/.test(deposit))
    throw new Error(`the deposit is not a yoctoNEAR amount: ${deposit}`);
  if (!/^[1-9]\d{0,15}$/.test(gas)) throw new Error(`the gas is not a gas amount: ${gas}`);
  return {type: 'FunctionCall', params: {methodName, args, gas, deposit}};
}

/**
 * NEP-141 `ft_transfer_call`: send `amount` of `token` to `receiver` and let it
 * act on `msg` (Pactora reads `{"Fund":{"agent_id":N}}` or `{"Stake":{"agent_id":N}}`).
 * One yocto, as NEP-141 requires. `amount` is base units; `msg` is a JSON-able
 * value and is sent as its JSON text.
 */
export function ftTransferCall(token: string, receiver: string, amount: string, msg: unknown): Transaction {
  if (!/^[1-9]\d{0,38}$/.test(amount))
    throw new Error(`the amount must be a positive whole number of base units: ${amount}`);
  if (!isAccountId(token)) throw new Error(`the token is not a NEAR account id: ${token}`);
  if (!isAccountId(receiver)) throw new Error(`the receiver is not a NEAR account id: ${receiver}`);
  return {
    receiverId: token,
    actions: [
      functionCall(
        'ft_transfer_call',
        {receiver_id: receiver, amount, msg: JSON.stringify(msg)},
        {gas: FT_TRANSFER_CALL_GAS, deposit: ONE_YOCTO},
      ),
    ],
  };
}

/** Sign and send one transaction as `signerId`; resolve with its hash. A failed outcome throws, with the chain's reason. */
export async function sendTransaction(
  wallet: NearWallet,
  signerId: string,
  tx: Transaction,
  label = tx.actions.map((a) => (a.type === 'FunctionCall' ? a.params.methodName : a.type)).join(' + '),
): Promise<{outcome: unknown; txHash: string | null}> {
  const [outcome] = await wallet.signAndSendTransactions({
    network: 'testnet',
    signerId,
    transactions: [tx],
  });
  const failed = failure(outcome);
  if (failed) throw new Error(`${label} failed: ${failed}`);
  const hash = (outcome as {transaction?: {hash?: unknown}} | undefined)?.transaction?.hash;
  return {outcome, txHash: typeof hash === 'string' ? hash : null};
}

// ─── a person's registration ───────────────────────────────────────────────

/**
 * A person is an agent whose wallet is their own account: `register_agent`
 * with `wallet = account`, then `accept_wallet`. No sub-account and no key for
 * the signer. `register_agent` carries the storage deposit.
 */
export function registerPersonTransaction(input: {
  pactora: string;
  wallet: string;
  cardUri: string;
  storageDeposit?: string;
}): Transaction {
  return {
    receiverId: input.pactora,
    actions: [
      functionCall(
        'register_agent',
        // per_task_cap and daily_cap null: the contract's defaults apply.
        {wallet: input.wallet, card_uri: input.cardUri, per_task_cap: null, daily_cap: null},
        {deposit: input.storageDeposit ?? REGISTRATION_AMOUNTS.storageDeposit},
      ),
    ],
  };
}

/** `accept_wallet(agent_id)`, called by the wallet itself. Not payable. */
export function acceptWalletTransaction(pactora: string, chainAgentId: string): Transaction {
  return {
    receiverId: pactora,
    actions: [functionCall('accept_wallet', {agent_id: agentIdArg(chainAgentId)})],
  };
}

/**
 * Register the signed-in account as a person on chain. Two sequential calls:
 * `accept_wallet` needs the id `register_agent` returns, which is only known
 * once the first has landed. Pass `resume` (the id from an earlier attempt)
 * to skip the first when it already succeeded.
 */
export async function registerPersonOnChain(
  wallet: NearWallet,
  input: {account: string; pactora: string; cardUri: string; resume?: string},
  progress?: (stage: 'register' | 'accept', chainAgentId?: string) => void,
): Promise<{chainAgentId: string; txHashes: string[]}> {
  if (!isAccountId(input.account)) throw new Error(`the account is not a NEAR account id: ${input.account}`);
  if (!isAccountId(input.pactora))
    throw new Error(`the Pactora contract account is invalid: ${input.pactora}`);
  const txHashes: string[] = [];
  let chainAgentId = input.resume;
  if (chainAgentId === undefined) {
    progress?.('register');
    const first = await sendTransaction(
      wallet,
      input.account,
      registerPersonTransaction({pactora: input.pactora, wallet: input.account, cardUri: input.cardUri}),
      'register_agent',
    );
    if (first.txHash) txHashes.push(first.txHash);
    chainAgentId = agentIdFromOutcome(first.outcome);
  }
  progress?.('accept', chainAgentId);
  const second = await sendTransaction(
    wallet,
    input.account,
    acceptWalletTransaction(input.pactora, chainAgentId),
    'accept_wallet',
  );
  if (second.txHash) txHashes.push(second.txHash);
  return {chainAgentId, txHashes};
}

// ─── connecting ────────────────────────────────────────────────────────────

let connector: Promise<NearConnector> | null = null;

/**
 * One connector per page, created on first use: NEAR Connect touches
 * `window` and IndexedDB, which do not exist during the server render.
 */
/**
 * The page's CSP nonce (middleware.ts), for the wallet iframe's inline code:
 * NEAR Connect puts it on the scripts it writes into the sandboxed iframe,
 * which inherits the page's policy. Browsers hide a nonce attribute from
 * `getAttribute`; the `nonce` property still reads it.
 */
function cspNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
  const nonce = meta?.nonce || meta?.getAttribute('nonce') || '';
  return nonce ? nonce : undefined;
}

function getConnector(): Promise<NearConnector> {
  const nonce = cspNonce();
  connector ??= import('@hot-labs/near-connect').then(
    ({NearConnector}) =>
      new NearConnector({
        network: 'testnet',
        ...(nonce ? {cspNonce: nonce} : {}),
        providers: {testnet: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']},
        // Only wallets that can do everything registration needs, on testnet.
        features: {signMessage: true, signAndSendTransactions: true, testnet: true},
        // Wallets that sign with a foreign key through a shim cannot create `<name>.<owner>`.
        excludedWallets: ['ethereum-wallets'],
      }),
  );
  return connector;
}

/**
 * A scripted wallet for the browser tests, honoured ONLY in a build made with
 * `NEXT_PUBLIC_E2E_WALLET=1` (`pnpm test:e2e` does; a production build never
 * does, and the branch is dead code there). The real connector opens wallet
 * iframes from third-party hosts, which a test cannot drive.
 */
function scriptedWallet(): {accountId: string; wallet: NearWallet} | null {
  if (process.env['NEXT_PUBLIC_E2E_WALLET'] !== '1') return null;
  return (
    (globalThis as {__pactoraTestWallet?: {accountId: string; wallet: NearWallet}}).__pactoraTestWallet ??
    null
  );
}

/** Open the wallet picker; resolve with the owner's account id. */
export async function connect(): Promise<{accountId: string; wallet: NearWallet}> {
  const scripted = scriptedWallet();
  if (scripted) return scripted;
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

// ─── registration (NEAR-WIRE §5) ───────────────────────────────────────────

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

// ─── the owner's actions on one agent ──────────────────────────────────────

/** Money into the agent's purse (spendable by the agent, within its caps). */
export const fundTransaction = (token: string, pactora: string, chainAgentId: string, amount: string) =>
  ftTransferCall(token, pactora, amount, {Fund: {agent_id: agentIdArg(chainAgentId)}});

/** Money into the agent's stake (the bond that makes it hireable as a worker). */
export const stakeTransaction = (token: string, pactora: string, chainAgentId: string, amount: string) =>
  ftTransferCall(token, pactora, amount, {Stake: {agent_id: agentIdArg(chainAgentId)}});

const call = (pactora: string, action: Action): Transaction => ({receiverId: pactora, actions: [action]});
const U128 = /^(0|[1-9]\d{0,38})$/;
const u128 = (value: string, what: string) => {
  if (!U128.test(value)) throw new Error(`${what} must be a whole number of base units: ${value}`);
  return value;
};

/** `set_caps`: the most the agent may spend per task and per day. One yocto. */
export const setCapsTransaction = (
  pactora: string,
  chainAgentId: string,
  perTaskCap: string,
  dailyCap: string,
) => {
  if (BigInt(u128(perTaskCap, 'the per-task cap')) > BigInt(u128(dailyCap, 'the daily cap'))) {
    throw new Error('the per-task cap cannot be above the daily cap');
  }
  return call(
    pactora,
    functionCall(
      'set_caps',
      {agent_id: agentIdArg(chainAgentId), per_task_cap: perTaskCap, daily_cap: dailyCap},
      {deposit: ONE_YOCTO},
    ),
  );
};

/** `request_unstake`: starts the withdrawal delay for `amount` of the stake. One yocto. */
export const requestUnstakeTransaction = (pactora: string, chainAgentId: string, amount: string) =>
  call(
    pactora,
    functionCall(
      'request_unstake',
      {agent_id: agentIdArg(chainAgentId), amount: u128(amount, 'the amount')},
      {deposit: ONE_YOCTO},
    ),
  );

/** `cancel_unstake`: puts the pending amount back into the stake. One yocto. */
export const cancelUnstakeTransaction = (pactora: string, chainAgentId: string) =>
  call(pactora, functionCall('cancel_unstake', {agent_id: agentIdArg(chainAgentId)}, {deposit: ONE_YOCTO}));

/** `complete_unstake`: after the delay, pays the pending stake to the owner. One yocto. */
export const completeUnstakeTransaction = (pactora: string, chainAgentId: string) =>
  call(pactora, functionCall('complete_unstake', {agent_id: agentIdArg(chainAgentId)}, {deposit: ONE_YOCTO}));

/** `unfreeze_agent`: the owner lifts the kill switch, so the agent can act and be hired again. One yocto. */
export const unfreezeTransaction = (pactora: string, chainAgentId: string) =>
  call(pactora, functionCall('unfreeze_agent', {agent_id: agentIdArg(chainAgentId)}, {deposit: ONE_YOCTO}));

/** `withdraw`: from the purse to `receiver` (the owner when omitted). One yocto. */
export const withdrawTransaction = (
  pactora: string,
  chainAgentId: string,
  amount: string,
  receiver?: string,
) => {
  if (receiver !== undefined && !isAccountId(receiver)) throw new Error(`not a NEAR account id: ${receiver}`);
  return call(
    pactora,
    functionCall(
      'withdraw',
      {agent_id: agentIdArg(chainAgentId), amount: u128(amount, 'the amount'), receiver: receiver ?? null},
      {deposit: ONE_YOCTO},
    ),
  );
};

/** `storage_deposit`: NEAR (yocto) that pays for the agent's records. Not one yocto: the whole deposit is kept. */
export const storageDepositTransaction = (pactora: string, chainAgentId: string, yoctoNear: string) => {
  if (!/^[1-9]\d{0,38}$/.test(yoctoNear))
    throw new Error(`the deposit must be a positive amount of yoctoNEAR`);
  return call(
    pactora,
    functionCall('storage_deposit', {agent_id: agentIdArg(chainAgentId)}, {deposit: yoctoNear}),
  );
};

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
 * agent on chain (NEAR-WIRE §5 a–c).
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
