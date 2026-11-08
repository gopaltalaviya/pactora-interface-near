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

/** One view call. Resolves with the parsed JSON (`null` when the contract returns `None`). */
export async function viewCall<T>(
  rpcUrl: string,
  contract: string,
  method: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(rpcUrl, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'pactora',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: contract,
          method_name: method,
          args_base64: toBase64(JSON.stringify(args)),
        },
      }),
      ...(signal ? {signal} : {}),
    });
  } catch (err) {
    if ((err as {name?: string})?.name === 'AbortError') throw err;
    throw new ChainReadError('Cannot reach the NEAR RPC node — check your connection and try again.');
  }
  let body:
    {result?: {result?: number[]; error?: string}; error?: {data?: unknown; message?: string}} | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new ChainReadError('The NEAR RPC node sent an answer that is not JSON.');
  }
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
