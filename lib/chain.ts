/**
 * Read-only calls to the Pactora contract, straight to a NEAR RPC node.
 *
 * `query` / `call_function` runs a view method with no signature and no gas
 * and returns its JSON result as bytes. The browser may reach the node because
 * its origin is in the CSP's `connect-src` (`NEXT_PUBLIC_RPC_ORIGINS`).
 *
 * u128 values come back as decimal strings and stay strings: they pass 2^53.
 */

import {agentIdArg} from './near';

export class ChainReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainReadError';
  }
}

/** The public testnet node: FastNEAR (rpc.testnet.near.org is deprecated and rate-limited). */
export const TESTNET_RPC = 'https://test.rpc.fastnear.com';

/**
 * The node this site reads a network through: the API's first RPC URL, or on
 * testnet the public node /swarm uses when the API names none.
 */
export function rpcOf(network: {testnet?: boolean; rpcUrls?: string[]}): string | null {
  return network.rpcUrls?.[0] ?? (network.testnet ? TESTNET_RPC : null);
}

type RpcBody = {
  result?: {result?: number[]; error?: string; [k: string]: unknown};
  error?: {data?: unknown; message?: string; cause?: {name?: string}};
};

/** One `query` to the node; resolves with the parsed body (errors are the caller's to read). */
async function query(
  rpcUrl: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RpcBody> {
  let res: Response;
  try {
    res = await fetch(rpcUrl, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 'pactora', method: 'query', params}),
      ...(signal ? {signal} : {}),
    });
  } catch (err) {
    if ((err as {name?: string})?.name === 'AbortError') throw err;
    throw new ChainReadError('Cannot reach the NEAR RPC node — check your connection and try again.');
  }
  try {
    return ((await res.json()) as RpcBody | undefined) ?? {};
  } catch {
    throw new ChainReadError('The NEAR RPC node sent an answer that is not JSON.');
  }
}

/** One view call. Resolves with the parsed JSON (`null` when the contract returns `None`). */
export async function viewCall<T>(
  rpcUrl: string,
  contract: string,
  method: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const body = await query(
    rpcUrl,
    {
      request_type: 'call_function',
      finality: 'final',
      account_id: contract,
      method_name: method,
      args_base64: toBase64(JSON.stringify(args)),
    },
    signal,
  );
  if (body?.error) {
    throw new ChainReadError(
      `The chain refused ${method}: ${String(body.error.data ?? body.error.message ?? 'error')}`,
    );
  }
  const result = body?.result;
  if (!result || result.error || !Array.isArray(result.result)) {
    throw new ChainReadError(`The chain refused ${method}: ${result?.error ?? 'no result'}`);
  }
  const text = new TextDecoder().decode(Uint8Array.from(result.result));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ChainReadError(`${method} returned something that is not JSON.`);
  }
}

/** `view_account`: the account's NEAR, in yoctoNEAR. Amounts stay strings. */
export interface AccountView {
  /** Spendable NEAR, yoctoNEAR. */
  amount: string;
  /** Staked with a validator, yoctoNEAR (not spendable). */
  locked: string;
  storage_usage: number;
}

/**
 * An account's NEAR balance, straight from the node. Resolves with null when
 * the account does not exist on chain (an implicit account nobody has sent
 * NEAR to yet), which is an answer, not a failure.
 */
export async function viewAccount(
  rpcUrl: string,
  accountId: string,
  signal?: AbortSignal,
): Promise<AccountView | null> {
  const body = await query(
    rpcUrl,
    {request_type: 'view_account', finality: 'final', account_id: accountId},
    signal,
  );
  const unknown = (text: unknown) => /UNKNOWN_ACCOUNT|does not exist/i.test(String(text ?? ''));
  if (body?.error) {
    if (body.error.cause?.name === 'UNKNOWN_ACCOUNT' || unknown(body.error.data)) return null;
    throw new ChainReadError(
      `The chain could not read ${accountId}: ${String(body.error.data ?? body.error.message ?? 'error')}`,
    );
  }
  const result = body?.result;
  if (result?.error) {
    if (unknown(result.error)) return null;
    throw new ChainReadError(`The chain could not read ${accountId}: ${result.error}`);
  }
  const amount = result?.['amount'];
  if (typeof amount !== 'string' || !/^\d{1,40}$/.test(amount)) {
    throw new ChainReadError(`The chain sent no balance for ${accountId}.`);
  }
  const locked = typeof result?.['locked'] === 'string' ? (result['locked'] as string) : '0';
  const usage = typeof result?.['storage_usage'] === 'number' ? (result['storage_usage'] as number) : 0;
  return {amount, locked, storage_usage: usage};
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** `purse_of`: what the agent may spend. Amounts are token base units. */
export interface PurseView {
  balance: string;
  per_task_cap: string;
  daily_cap: string;
  spent_today: string;
  daily_remaining: string;
  next_release_at: number;
}

/** `stake_of`: the agent's bond. */
export interface StakeView {
  available: string;
  pending: string;
  unlock_at: number;
  locked: string;
  unlocked: string;
  hireable: boolean;
}

/** The part of `get_agent` the manage page reads. */
export interface ChainAgent {
  owner: string;
  wallet: string | null;
  pending_wallet: string | null;
  frozen: boolean;
}

export interface AgentOnChain {
  agent: ChainAgent | null;
  purse: PurseView | null;
  stake: StakeView | null;
  /** NEAR held for this agent's storage, yoctoNEAR. */
  storage: string | null;
}

/** Everything the manage page shows, four view calls in parallel. */
export async function readAgent(
  rpcUrl: string,
  pactora: string,
  chainAgentId: string,
  signal?: AbortSignal,
): Promise<AgentOnChain> {
  const args = {agent_id: agentIdArg(chainAgentId)};
  const [agent, purse, stake, storage] = await Promise.all([
    viewCall<ChainAgent | null>(rpcUrl, pactora, 'get_agent', args, signal),
    viewCall<PurseView | null>(rpcUrl, pactora, 'purse_of', args, signal),
    viewCall<StakeView | null>(rpcUrl, pactora, 'stake_of', args, signal),
    viewCall<string | null>(rpcUrl, pactora, 'storage_balance_of', args, signal),
  ]);
  return {agent, purse, stake, storage};
}
