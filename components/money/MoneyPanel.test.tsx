// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {NetworkInfo} from '@/lib/api';
import {MoneyPanel, type MoneyState} from './MoneyPanel';

afterEach(cleanup);

const network = {
  chainId: 'near:testnet',
  nearNetworkId: 'testnet',
  name: 'NEAR Testnet',
  testnet: true,
  paymentToken: {symbol: 'mUSDC', decimals: 6, accountId: 'musdc.testnet'},
  contracts: {Pactora: 'pactora.testnet', PaymentToken: 'musdc.testnet', Arbiter: 'arb.testnet'},
  rpcUrls: ['https://rpc.test'],
  nativeCurrency: {name: 'NEAR', symbol: 'NEAR', decimals: 24},
  explorerBaseUrl: null,
  faucetUrls: [],
  fastPathMaxDisplay: '5 mUSDC',
  protocolFeeBps: 100,
  minStake: '10000000',
} satisfies NetworkInfo;

const record = {
  agent: {owner: 'ann.testnet', wallet: 'ann.testnet', pending_wallet: null, frozen: false},
  purse: {
    balance: '0',
    per_task_cap: '1000000',
    daily_cap: '2000000',
    spent_today: '0',
    daily_remaining: '2000000',
    next_release_at: 0,
  },
  stake: {
    available: '12000000',
    pending: '0',
    unlock_at: 0,
    locked: '0',
    unlocked: '12000000',
    hireable: true,
  },
  storage: '90000000000000000000000',
};

const state = (over: Partial<MoneyState> = {}): MoneyState => ({
  loading: false,
  wallet: {
    near: {ok: true, value: '1000000000000000000000000'},
    token: {ok: true, value: '5000000'},
    registered: {ok: true, value: true},
  },
  record: {ok: true, value: record},
  jobs: null,
  reload: vi.fn(),
  ...over,
});

const panel = (money: MoneyState, extra: Partial<Parameters<typeof MoneyPanel>[0]> = {}) =>
  render(<MoneyPanel network={network} money={money} account="ann.testnet" chainAgentId="177" {...extra} />);

describe('MoneyPanel', () => {
  it('while loading, says so to a screen reader and shows placeholders', () => {
    panel(state({loading: true, wallet: null, record: null}));
    expect(screen.getByRole('status').textContent).toContain('Reading your balances');
    expect(screen.getByRole('region', {name: 'Your money'}).getAttribute('aria-labelledby')).toBe('money');
  });

  it('a low balance gets a badge, a sentence and a link to fix it', () => {
    panel(state());
    const purse = screen.getByTestId('money-purse');
    expect(purse.getAttribute('data-status')).toBe('low');
    expect(within(purse).getByText('Low')).toBeTruthy();
    expect(within(purse).getByText(/Pays for the jobs you hire/)).toBeTruthy();
    expect(within(purse).getByRole('link', {name: 'Fund your purse'}).getAttribute('href')).toBe(
      '/agents/177/manage#fund-card',
    );
    expect(screen.getByTestId('money-token').getAttribute('data-status')).toBe('ok');
  });

  it('an account the token does not know is missing, with the faucet as the next step', () => {
    panel(
      state({
        wallet: {
          near: {ok: true, value: '1000000000000000000000000'},
          token: {ok: true, value: '0'},
          registered: {ok: true, value: false},
        },
      }),
    );
    const reg = screen.getByTestId('money-registered');
    expect(reg.getAttribute('data-status')).toBe('missing');
    expect(within(reg).getByText('Not yet')).toBeTruthy();
    expect(
      within(reg)
        .getByRole('link', {name: /faucet/})
        .getAttribute('href'),
    ).toBe('/me#faucet');
  });

  it('an RPC failure is said on its line, and Refresh reads again', () => {
    const money = state({
      wallet: {
        near: {ok: false, error: 'Cannot reach the NEAR RPC node — check your connection and try again.'},
        token: {ok: true, value: '5000000'},
        registered: {ok: true, value: true},
      },
    });
    panel(money);
    const near = screen.getByTestId('money-near');
    expect(near.getAttribute('data-status')).toBe('error');
    expect(within(near).getByText('Could not be read')).toBeTruthy();
    expect(within(near).getByText(/Cannot reach the NEAR RPC node/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(money.reload).toHaveBeenCalledOnce();
  });

  it('compact keeps only the lines a form needs, without the meanings', () => {
    panel(state(), {compact: true, only: ['purse', 'daily'], id: 'hire-money'});
    expect(screen.getByTestId('money-purse')).toBeTruthy();
    expect(screen.queryByTestId('money-near')).toBeNull();
    expect(screen.queryByText(/Pays for the jobs you hire/)).toBeNull();
    expect(screen.getByRole('region', {name: /Your money/})).toBeTruthy();
  });
});
