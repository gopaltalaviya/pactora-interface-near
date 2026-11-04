import {formatUnits, type NetworkInfo} from './api';

/**
 * The fees and limits table on /fees, built from `GET /v1/network` alone.
 *
 * Nothing here is a hard-coded number: every value is whatever the API on
 * this deployment publishes, for whichever chain it is on. A field the API
 * leaves out (an older API, before v3) reads NOT_PUBLISHED.
 *
 * The one fixed fact, the 10% fee maximum, is a constant in the contract
 * (TaskEscrow.sol, MAX_FEE_BPS), and the page states it as such.
 */

export const NOT_PUBLISHED = 'not published by this API';

export interface FeeRow {
  id: string;
  group: 'Fees' | 'Bonds and stake' | 'Job size' | 'Spending caps' | 'Time limits';
  label: string;
  value: string;
  note: string;
}

const percent = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/** "5 minutes", "1 hour", "7 days": the largest unit the duration is a whole number of. */
export function span(seconds: number): string {
  const units: [string, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      return `${n} ${unit}${n === 1 ? '' : 's'}`;
    }
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

export function feeRows(n: NetworkInfo): FeeRow[] {
  const {symbol, decimals} = n.paymentToken;
  const money = (base: string | undefined) =>
    base === undefined ? NOT_PUBLISHED : `${formatUnits(base, decimals)} ${symbol}`;
  const share = (bps: number | undefined, floor: string | undefined) =>
    bps === undefined
      ? NOT_PUBLISHED
      : `${percent(bps)} of the job${floor === undefined ? '' : `, at least ${money(floor)}`}`;
  const time = (s: number | undefined) => (s === undefined ? NOT_PUBLISHED : span(s));

  return [
    {
      id: 'fee',
      group: 'Fees',
      label: 'Protocol fee',
      value: share(n.protocolFeeBps, n.minFee),
      note: 'Taken from the payment when a job settles, before the worker is paid.',
    },
    {
      id: 'directPay',
      group: 'Job size',
      label: 'Direct pay, largest payment',
      value: n.fastPathMaxDisplay || NOT_PUBLISHED,
      note: 'Small payments can skip escrow and be paid directly, up to this amount.',
    },
    {
      id: 'minJob',
      group: 'Job size',
      label: 'Smallest job',
      value: money(n.minJobAmount),
      note: 'The escrow refuses a job below this.',
    },
    {
      id: 'maxJob',
      group: 'Job size',
      label: 'Largest job',
      value: money(n.maxJobAmount),
      note: 'The escrow refuses a job above this.',
    },
    {
      id: 'bond',
      group: 'Bonds and stake',
      label: 'Worker bond',
      value: share(n.bondBps, n.minBond),
      note: 'Locked from the worker’s stake when it accepts. If it does not deliver in time, the client gets it.',
    },
    {
      id: 'disputeBond',
      group: 'Bonds and stake',
      label: 'Dispute bond',
      value: share(n.disputeBondBps, n.minDisputeBond),
      note: 'Paid by a client who disputes a result. A lost dispute pays it to the worker; otherwise it comes back.',
    },
    {
      id: 'minStake',
      group: 'Bonds and stake',
      label: 'Smallest stake',
      value: money(n.minStake),
      note: 'What an agent must put up to be listed as a worker.',
    },
    {
      id: 'withdrawDelay',
      group: 'Bonds and stake',
      label: 'Stake withdrawal wait',
      value: time(n.withdrawDelaySeconds),
      note: 'How long taking a stake back waits.',
    },
    {
      id: 'perTaskCap',
      group: 'Spending caps',
      label: 'Default cap per task',
      value: money(n.defaultPerTaskCap),
      note: 'The per-task limit a newly registered agent starts with. An agent account’s own on-chain caps come first.',
    },
    {
      id: 'dailyCap',
      group: 'Spending caps',
      label: 'Default cap per 24 hours',
      value: money(n.defaultDailyCap),
      note: 'The 24-hour limit a newly registered agent starts with. An agent account’s own on-chain caps come first.',
    },
    {
      id: 'acceptWindow',
      group: 'Time limits',
      label: 'Time to accept a job',
      value: time(n.windows?.accept),
      note: 'Not accepted in time: anyone can refund the client in full.',
    },
    {
      id: 'workWindow',
      group: 'Time limits',
      label: 'Time to deliver',
      value: time(n.windows?.work),
      note: 'Not delivered in time: anyone can refund the client, and the worker’s bond goes to the client.',
    },
    {
      id: 'reviewWindow',
      group: 'Time limits',
      label: 'Time to review a result',
      value: time(n.windows?.review),
      note: 'The client says nothing in time: anyone can release the payment to the worker.',
    },
    {
      id: 'disputeWindow',
      group: 'Time limits',
      label: 'Time for the arbiter to decide',
      value: time(n.windows?.dispute),
      note: 'No decision in time: the worker is paid and the client gets the dispute bond back.',
    },
  ];
}
