/**
 * "Your money": every place a person's money can be, read where it lives, and
 * each said in one sentence with the next step when it is low or missing.
 *
 * - the wallet's NEAR (RPC `view_account`): what pays the network fee;
 * - the wallet's tokens (the token's `ft_balance_of`) and whether the token
 *   knows the account (`storage_balance_of`): what funds the purse or stake;
 * - the Pactora record (lib/chain.ts readAgent): purse, caps, stake, storage;
 * - open jobs (GET /v1/jobs?status=open): held in escrow as a client, a bond
 *   at stake as a worker.
 *
 * Each read stands alone: one that fails says so on its own line and never
 * hides the others. Amounts are base-unit strings and BigInt, never floats.
 */

import {formatUnits, type NetworkInfo} from './api';
import {readAgent, viewAccount, viewCall, type AgentOnChain} from './chain';
import {disputeBondOf, workerBondOf} from './fees';
import {releaseText, STORAGE_PER_JOB_YOCTO, type Fix} from './hire';
import {manageHref} from './links';
import type {JobRow} from './market';
import {formatYocto} from './near';

/** A read that either answered or failed, with the failure in words. */
export type Settled<T> = {ok: true; value: T} | {ok: false; error: string};

const settle = async <T>(p: Promise<T>): Promise<Settled<T>> => {
  try {
    return {ok: true, value: await p};
  } catch (err) {
    if ((err as {name?: string})?.name === 'AbortError') throw err;
    return {ok: false, error: err instanceof Error ? err.message : 'could not be read'};
  }
};

/** Below this the wallet may not cover the gas of a few transactions: 0.05 NEAR. */
export const LOW_NEAR_YOCTO = 50_000_000_000_000_000_000_000n;

/** The NEAR testnet faucet a person is sent to when the API names none. */
export const NEAR_FAUCET = 'https://near-faucet.io/';

/** The wallet's three lines. `near` is null when the account does not exist on chain. */
export interface WalletMoney {
  near: Settled<string | null>;
  token: Settled<string> | null;
  registered: Settled<boolean> | null;
}

/** What the wallet holds, three reads side by side. `tokenId` null: the API names no token yet. */
export async function readWallet(
  rpc: string,
  account: string,
  tokenId: string | null,
  signal?: AbortSignal,
): Promise<WalletMoney> {
  const [near, token, registered] = await Promise.all([
    settle(viewAccount(rpc, account, signal).then((a) => (a ? a.amount : null))),
    tokenId
      ? settle(
          viewCall<string | null>(rpc, tokenId, 'ft_balance_of', {account_id: account}, signal).then((v) =>
            typeof v === 'string' && /^\d{1,39}$/.test(v) ? v : '0',
          ),
        )
      : Promise.resolve(null),
    tokenId
      ? settle(
          viewCall<unknown>(rpc, tokenId, 'storage_balance_of', {account_id: account}, signal).then(
            (v) => v !== null && v !== undefined,
          ),
        )
      : Promise.resolve(null),
  ]);
  return {near, token, registered};
}

/** The Pactora record, as one settled read. */
export const readRecord = (rpc: string, pactora: string, chainAgentId: string, signal?: AbortSignal) =>
  settle(readAgent(rpc, pactora, chainAgentId, signal));

/** Money in open jobs, from the person's side of each. */
export interface OpenJobsMoney {
  /** As a client: held in escrow (and any dispute bond), base units. */
  escrow: string;
  escrowJobs: number;
  /** As a worker: bonds locked from the stake, base units. */
  bonds: string;
  bondJobs: number;
  /** More open jobs than one page: the sums count the first page only. */
  partial: boolean;
}

const FUNDED = new Set(['created', 'accepted', 'submitted', 'disputed']);
const BONDED = new Set(['accepted', 'submitted', 'disputed']);

/**
 * Sum the open jobs. A client's money is in escrow once the job is on chain
 * (a job not on chain yet holds nothing); a disputed job also holds the
 * client's dispute bond. A worker's bond is locked from acceptance until the
 * job settles. Bonds are the network's rule at each job's price.
 */
export function openJobsMoney(
  rows: Pick<JobRow, 'state' | 'role' | 'amount' | 'chainJobId'>[],
  n: Pick<NetworkInfo, 'bondBps' | 'minBond' | 'disputeBondBps' | 'minDisputeBond' | 'protocolFeeBps'>,
  partial = false,
): OpenJobsMoney {
  let escrow = 0n;
  let bonds = 0n;
  let escrowJobs = 0;
  let bondJobs = 0;
  for (const j of rows) {
    if (!/^\d{1,39}$/.test(j.amount) || !j.chainJobId) continue;
    if (j.role === 'client' && FUNDED.has(j.state)) {
      escrow += BigInt(j.amount);
      if (j.state === 'disputed') escrow += disputeBondOf(j.amount, n) ?? 0n;
      escrowJobs += 1;
    }
    if (j.role === 'worker' && BONDED.has(j.state)) {
      bonds += workerBondOf(j.amount, n) ?? 0n;
      bondJobs += 1;
    }
  }
  return {escrow: escrow.toString(), escrowJobs, bonds: bonds.toString(), bondJobs, partial};
}

export type LineStatus = 'ok' | 'low' | 'missing' | 'error';

/** One line of the panel: what it is, what it holds, what it means, and what to do. */
export interface MoneyLine {
  id: string;
  label: string;
  value: string;
  /** One sentence: what this money is for. */
  meaning: string;
  status: LineStatus;
  /** When low, missing or unreadable: the sentence that says what to do. */
  advice?: string;
  next?: Fix;
}

export interface MoneyInput {
  network: NetworkInfo;
  account: string | null;
  chainAgentId: string | null;
  wallet: WalletMoney | null;
  record: Settled<AgentOnChain> | null;
  jobs: Settled<OpenJobsMoney> | null;
  /** "now", unix ms; injected by tests. */
  nowMs?: number;
}

const httpsOnly = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

/** The NEAR faucet for gas: the API's own, or the public one on testnet. */
export function nearFaucetOf(n: Pick<NetworkInfo, 'faucetUrls' | 'testnet'>): string | null {
  const own = (n.faucetUrls ?? []).map(httpsOnly).find(Boolean);
  return own ?? (n.testnet ? NEAR_FAUCET : null);
}

const nx = (f: Fix | undefined): {next?: Fix} => (f ? {next: f} : {});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The panel's lines, in reading order. Pure: the component only lays them out. */
/**
 * The record's lines worded for an agent the signed-in person owns, not for
 * the person: "Your purse is empty, so you cannot fund a job" sat under an
 * agent's purse on its manage page (live test, 2026-11-13). The wallet lines
 * stay "your": the wallet is the person's.
 */
export function forAgent(line: MoneyLine): MoneyLine {
  const RECORD = new Set(['purse', 'daily', 'stake', 'storage', 'escrow', 'bonds']);
  if (!RECORD.has(line.id)) return line;
  const say = (t: string) =>
    t
      .replace('NEAR for your Pactora records', "NEAR for this agent's records")
      .replace('Pays for the jobs you hire', 'Pays for the jobs this agent hires')
      .replace(
        'Your purse is empty, so you cannot fund a job',
        "This agent's purse is empty, so it cannot fund a job",
      )
      .replace('Your daily cap less what you spent', 'Its daily cap less what it spent')
      .replace('You have spent your daily cap', 'It has spent its daily cap')
      .replace('Your bond as a worker', 'Its bond as a worker')
      .replace('keeps you hireable', 'keeps it hireable')
      .replace('each job you accept', 'each job it accepts')
      .replace('nobody can hire you', 'nobody can hire this agent')
      .replace('the space your record and your jobs take', 'the space its record and its jobs take')
      .replace('Add storage before you hire', 'Add storage before it hires')
      .replace('jobs you hired', 'jobs this agent hired')
      .replace('jobs you work', 'jobs this agent works');
  return {
    ...line,
    label: say(line.label),
    meaning: say(line.meaning),
    ...(line.advice !== undefined ? {advice: say(line.advice)} : {}),
  };
}

export function moneyLines(input: MoneyInput): MoneyLine[] {
  const {network: n, wallet, record, jobs, chainAgentId} = input;
  const {symbol, decimals} = n.paymentToken;
  const units = (base: string) => `${formatUnits(base, decimals)} ${symbol}`.trim();
  const manage = (anchor: string, label: string): Fix | undefined =>
    chainAgentId ? {href: `${manageHref(chainAgentId)}#${anchor}`, label} : undefined;
  const tokenFaucet: Fix | undefined = n.testnet
    ? {href: '/me#faucet', label: `Get test ${symbol} from the faucet`}
    : undefined;
  const gasFaucet = nearFaucetOf(n);
  const lines: MoneyLine[] = [];
  const failed = (id: string, label: string, meaning: string, error: string): MoneyLine => ({
    id,
    label,
    value: 'Could not be read',
    meaning,
    status: 'error',
    advice: `${error} Use Refresh to read it again.`,
  });

  if (wallet && input.account) {
    const meaning = 'Pays the network fee (gas) of every transaction you sign. It never pays for jobs.';
    if (!wallet.near.ok) lines.push(failed('near', 'NEAR in your wallet', meaning, wallet.near.error));
    else if (wallet.near.value === null)
      lines.push({
        id: 'near',
        label: 'NEAR in your wallet',
        value: '0 NEAR',
        meaning,
        status: 'missing',
        advice:
          'Your account is not on chain yet: it exists once someone sends it NEAR. Get some NEAR before you sign anything.',
        ...nx(gasFaucet ? {href: gasFaucet, label: 'NEAR testnet faucet'} : undefined),
      });
    else {
      const low = BigInt(wallet.near.value) < LOW_NEAR_YOCTO;
      lines.push({
        id: 'near',
        label: 'NEAR in your wallet',
        value: `${formatYocto(wallet.near.value)} NEAR`,
        meaning,
        status: low ? 'low' : 'ok',
        ...(low
          ? {
              advice: `Below ${formatYocto(LOW_NEAR_YOCTO.toString())} NEAR, a transaction may fail for gas. Top up first.`,
              ...nx(gasFaucet ? {href: gasFaucet, label: 'NEAR testnet faucet'} : undefined),
            }
          : {}),
      });
    }

    const tokenMeaning = `${symbol} you hold yourself, not yet in Pactora: fund your purse or stake from it.`;
    if (wallet.token) {
      if (!wallet.token.ok)
        lines.push(failed('token', `${symbol} in your wallet`, tokenMeaning, wallet.token.error));
      else {
        const empty = wallet.token.value === '0';
        lines.push({
          id: 'token',
          label: `${symbol} in your wallet`,
          value: units(wallet.token.value),
          meaning: tokenMeaning,
          status: empty ? 'low' : 'ok',
          ...(empty
            ? {
                advice: n.testnet
                  ? `You hold no ${symbol}. Claim test ${symbol} from the faucet, then fund or stake.`
                  : `You hold no ${symbol}. Send some to this account, then fund or stake.`,
                ...nx(tokenFaucet),
              }
            : {}),
        });
      }
    }
    if (wallet.registered) {
      const meaning = `The ${symbol} contract keeps a record of every account that can hold it.`;
      if (!wallet.registered.ok)
        lines.push(failed('registered', `Registered with ${symbol}`, meaning, wallet.registered.error));
      else
        lines.push({
          id: 'registered',
          label: `Registered with ${symbol}`,
          value: wallet.registered.value ? 'Yes' : 'Not yet',
          meaning,
          status: wallet.registered.value ? 'ok' : 'missing',
          ...(wallet.registered.value
            ? {}
            : {
                advice: n.testnet
                  ? `Until it is, nobody can send you ${symbol}. A faucet claim registers you first.`
                  : `Until it is, nobody can send you ${symbol}: register with storage_deposit on the token.`,
                ...nx(tokenFaucet),
              }),
        });
    }
  }

  if (record && chainAgentId) {
    if (!record.ok) {
      lines.push(
        failed(
          'record',
          'Your Pactora purse and stake',
          'What the escrow holds for you: your purse, caps, stake and storage.',
          record.error,
        ),
      );
    } else {
      const {purse, stake, storage} = record.value;
      if (purse) {
        const empty = purse.balance === '0';
        lines.push({
          id: 'purse',
          label: 'Purse',
          value: units(purse.balance),
          meaning: 'Pays for the jobs you hire: each one moves its price from here into escrow.',
          status: empty ? 'low' : 'ok',
          ...(empty
            ? {
                advice: `Your purse is empty, so you cannot fund a job. Move ${symbol} from your wallet into it.`,
                ...nx(manage('fund-card', 'Fund your purse')),
              }
            : {}),
        });
        const release = releaseText(purse.next_release_at, input.nowMs ?? Date.now());
        const out = purse.daily_remaining === '0';
        lines.push({
          id: 'daily',
          label: 'Left to spend in 24 hours',
          value: `${units(purse.daily_remaining)} of ${units(purse.daily_cap)}`,
          meaning: `Your daily cap less what you spent in the last 24 hours; at most ${units(purse.per_task_cap)} on one job.${release}`,
          status: out ? 'low' : 'ok',
          ...(out
            ? {
                advice: `You have spent your daily cap.${release || ' It frees up as the last 24 hours roll on.'} Or raise the cap.`,
                ...nx(manage('caps-card', 'Change your caps')),
              }
            : {}),
        });
      }
      if (stake) {
        const min = n.minStake;
        const below = min !== undefined && BigInt(stake.unlocked) < BigInt(min);
        lines.push({
          id: 'stake',
          label: 'Stake (unlocked)',
          value: units(stake.unlocked),
          meaning: `Your bond as a worker: ${min !== undefined ? `at least ${units(min)} unlocked keeps you hireable, and ` : ''}each job you accept locks a share of it.${stake.locked !== '0' ? ` ${units(stake.locked)} is locked in jobs now.` : ''}`,
          status: below ? 'low' : 'ok',
          ...(below
            ? {
                advice: `Below the minimum, nobody can hire you. Add at least ${units((BigInt(min!) - BigInt(stake.unlocked)).toString())}.`,
                ...nx(manage('stake-card', 'Add stake')),
              }
            : {}),
        });
      }
      if (storage !== null) {
        const low = BigInt(storage) < STORAGE_PER_JOB_YOCTO;
        lines.push({
          id: 'storage',
          label: 'NEAR for your Pactora records',
          value: `${formatYocto(storage)} NEAR`,
          meaning: 'Pays for the space your record and your jobs take on chain. Each new job uses a little.',
          status: low ? 'low' : 'ok',
          ...(low
            ? {
                advice: `A new job needs about ${formatYocto(STORAGE_PER_JOB_YOCTO.toString())} NEAR here. Add storage before you hire.`,
                ...nx(manage('storage-card', 'Add storage')),
              }
            : {}),
        });
      }
    }
  }

  if (jobs) {
    if (!jobs.ok)
      lines.push(
        failed(
          'jobs',
          'Money in open jobs',
          'What your open jobs hold: in escrow as a client, bonds as a worker.',
          jobs.error,
        ),
      );
    else {
      const more = jobs.value.partial ? ' (your first 100 open jobs)' : '';
      lines.push({
        id: 'escrow',
        label: 'Held in escrow for jobs you hired',
        value: units(jobs.value.escrow),
        meaning: `${jobs.value.escrowJobs === 0 ? 'No open job holds your money.' : `${plural(jobs.value.escrowJobs, 'open job')}${more}: paid to the worker when you approve, back to you if the job ends unfinished.`}`,
        status: 'ok',
      });
      lines.push({
        id: 'bonds',
        label: 'Your bonds in jobs you work',
        value: units(jobs.value.bonds),
        meaning: `${jobs.value.bondJobs === 0 ? 'No accepted job holds a bond of yours.' : `${plural(jobs.value.bondJobs, 'accepted job')}${more}: returned when you deliver, paid to the client if you miss a deadline.`}`,
        status: 'ok',
      });
    }
  }
  return lines;
}
