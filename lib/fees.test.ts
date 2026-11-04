import {describe, expect, it} from 'vitest';
import type {NetworkInfo} from './api';
import {NOT_PUBLISHED, feeRows, span} from './fees';

const base: NetworkInfo = {
  chainId: 10143,
  name: 'Monad Testnet',
  testnet: true,
  paymentToken: {symbol: 'USDC', decimals: 6, address: null},
  contracts: {},
  erc8004: {referenceImplementation: true},
  rpcUrls: [],
  nativeCurrency: {name: 'MON', symbol: 'MON', decimals: 18},
  explorerBaseUrl: null,
  fastPathMaxDisplay: '0.03 USDC',
  protocolFeeBps: 100,
};

const value = (rows: ReturnType<typeof feeRows>, id: string) => rows.find((r) => r.id === id)?.value;

/**
 * The fees page shows whatever /v1/network says, for whichever chain the site
 * is on. A field the API does not publish must read as exactly that — never
 * a number copied from somewhere else.
 */
describe('feeRows', () => {
  it('formats every published value from the API', () => {
    const rows = feeRows({
      ...base,
      minFee: '100',
      minJobAmount: '10000',
      windows: {accept: 300, work: 1800, review: 600, dispute: 3600},
      bondBps: 2000,
      minBond: '10000',
      disputeBondBps: 1000,
      minDisputeBond: '1000000',
      maxJobAmount: '10000000',
      defaultPerTaskCap: '100000',
      defaultDailyCap: '1000000',
      minStake: '10000000',
      withdrawDelaySeconds: 604800,
    });
    expect(value(rows, 'fee')).toBe('1% of the job, at least 0.0001 USDC');
    expect(value(rows, 'bond')).toBe('20% of the job, at least 0.01 USDC');
    expect(value(rows, 'disputeBond')).toBe('10% of the job, at least 1 USDC');
    expect(value(rows, 'minJob')).toBe('0.01 USDC');
    expect(value(rows, 'maxJob')).toBe('10 USDC');
    expect(value(rows, 'directPay')).toBe('0.03 USDC');
    expect(value(rows, 'perTaskCap')).toBe('0.1 USDC');
    expect(value(rows, 'dailyCap')).toBe('1 USDC');
    expect(value(rows, 'minStake')).toBe('10 USDC');
    expect(value(rows, 'withdrawDelay')).toBe('7 days');
    expect(value(rows, 'acceptWindow')).toBe('5 minutes');
    expect(value(rows, 'workWindow')).toBe('30 minutes');
    expect(value(rows, 'disputeWindow')).toBe('1 hour');
  });

  it('says "not published by this API" for every field an older API leaves out', () => {
    const rows = feeRows(base);
    expect(value(rows, 'fee')).toBe('1% of the job');
    for (const id of [
      'bond',
      'disputeBond',
      'minJob',
      'maxJob',
      'perTaskCap',
      'dailyCap',
      'minStake',
      'withdrawDelay',
      'acceptWindow',
      'workWindow',
      'reviewWindow',
      'disputeWindow',
    ]) {
      expect(value(rows, id), id).toBe(NOT_PUBLISHED);
    }
  });

  it('shows a percentage without a floor when only the floor is missing', () => {
    expect(value(feeRows({...base, bondBps: 2000}), 'bond')).toBe('20% of the job');
  });

  it('uses the payment token the API names', () => {
    const rows = feeRows({
      ...base,
      paymentToken: {symbol: 'TST', decimals: 2, address: null},
      minStake: '150',
    });
    expect(value(rows, 'minStake')).toBe('1.5 TST');
  });
});

describe('span', () => {
  it('names a duration in the largest whole unit', () => {
    expect(span(1)).toBe('1 second');
    expect(span(90)).toBe('90 seconds');
    expect(span(120)).toBe('2 minutes');
    expect(span(3600)).toBe('1 hour');
    expect(span(5400)).toBe('90 minutes');
    expect(span(172800)).toBe('2 days');
  });
});
