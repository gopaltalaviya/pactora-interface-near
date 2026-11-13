// @vitest-environment happy-dom
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ApiError, api} from './api';
import {SESSION_KEY, SessionProvider, useSession, type SessionValue} from './session';
import * as wallet from './wallet';

let current: SessionValue;
function Probe() {
  current = useSession();
  return (
    <p>
      {current.status}:{current.account ?? '-'}
    </p>
  );
}
const mount = () =>
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

const info = {
  account: 'alice.testnet',
  chainId: 'near:testnet',
  expiresAt: '2026-11-15T00:00:00Z',
  person: null,
};
const stored = {
  token: 'ps_0123456789abcdef_' + 'x'.repeat(32),
  account: 'alice.testnet',
  expiresAt: info.expiresAt,
};

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('restoring a session', () => {
  it('is signed out when nothing is stored, without asking the API', async () => {
    const get = vi.spyOn(api, 'getSession');
    mount();
    await screen.findByText('out:-');
    expect(get).not.toHaveBeenCalled();
  });

  it('checks a stored token with the API and signs in on success', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    const get = vi.spyOn(api, 'getSession').mockResolvedValue(info);
    mount();
    await screen.findByText('in:alice.testnet');
    expect(get).toHaveBeenCalledWith(stored.token, expect.anything());
  });

  it('clears a token the API refuses (401)', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    vi.spyOn(api, 'getSession').mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired'));
    mount();
    await screen.findByText('out:-');
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('keeps the token when the API is merely unreachable', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    vi.spyOn(api, 'getSession').mockRejectedValue(new ApiError('UNREACHABLE', 'down'));
    mount();
    await screen.findByText('in:alice.testnet');
    expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
  });

  it('an unreachable API leaves the person record unknown, not absent, and retry reads it', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    const get = vi.spyOn(api, 'getSession').mockRejectedValueOnce(new ApiError('UNREACHABLE', 'down'));
    mount();
    await screen.findByText('in:alice.testnet');
    // "No person record" and "could not ask" must not look the same to a page.
    expect(current.person).toBeNull();
    expect(current.personError).toMatch(/reach/i);

    // Still down: the error stays.
    get.mockRejectedValueOnce(new ApiError('UNREACHABLE', 'down'));
    await act(() => current.retry());
    expect(current.personError).not.toBeNull();

    get.mockResolvedValueOnce({...info, person: {publicId: 'p-1', chainAgentId: '7', name: 'Alice'}});
    await act(() => current.retry());
    await waitFor(() => expect(current.personError).toBeNull());
    expect(current.person?.name).toBe('Alice');
    expect(current.status).toBe('in');
  });

  it('a refusal on retry signs the tab out', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    const get = vi.spyOn(api, 'getSession').mockRejectedValueOnce(new ApiError('UNREACHABLE', 'down'));
    mount();
    await screen.findByText('in:alice.testnet');
    get.mockRejectedValueOnce(new ApiError('UNAUTHORIZED', 'expired'));
    await act(() => current.retry());
    await screen.findByText('out:-');
    expect(current.personError).toBeNull();
  });

  it('ignores a malformed stored value', async () => {
    window.sessionStorage.setItem(SESSION_KEY, '{not json');
    mount();
    await screen.findByText('out:-');
  });

  it('still works when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount();
    await screen.findByText('out:-');
  });
});

describe('signing in and out', () => {
  const connected = {
    accountId: 'alice.testnet',
    wallet: {} as wallet.NearWallet,
  };

  async function signedIn() {
    vi.spyOn(wallet, 'connect').mockResolvedValue(connected);
    vi.spyOn(api, 'createSession').mockResolvedValue({...info, token: stored.token});
    mount();
    await screen.findByText('out:-');
    await act(() => current.signIn());
    await screen.findByText('in:alice.testnet');
  }

  it('stores the token in sessionStorage only', async () => {
    await signedIn();
    expect(JSON.parse(window.sessionStorage.getItem(SESSION_KEY)!)).toMatchObject({token: stored.token});
    expect(window.localStorage.length).toBe(0);
  });

  it('sends the token as the caller’s bearer, and a 401 signs this tab out', async () => {
    await signedIn();
    const seen: string[] = [];
    await act(() => current.authed(async (t) => void seen.push(t)));
    expect(seen).toEqual([stored.token]);
    await act(async () => {
      await current
        .authed(async () => {
          throw new ApiError('UNAUTHORIZED', 'expired');
        })
        .catch(() => undefined);
    });
    await screen.findByText('out:-');
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('sign out calls DELETE /v1/session and clears; sign out everywhere calls DELETE /v1/sessions', async () => {
    vi.spyOn(wallet, 'disconnect').mockResolvedValue();
    const one = vi.spyOn(api, 'deleteSession').mockResolvedValue();
    const all = vi.spyOn(api, 'deleteAllSessions').mockResolvedValue();
    await signedIn();
    await act(() => current.signOut());
    await screen.findByText('out:-');
    expect(one).toHaveBeenCalledWith(stored.token);
    expect(all).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();

    cleanup();
    await signedIn();
    await act(() => current.signOutEverywhere());
    await screen.findByText('out:-');
    expect(all).toHaveBeenCalledWith(stored.token);
  });

  it('keeps the session when sign out fails for a reason other than 401', async () => {
    vi.spyOn(api, 'deleteSession').mockRejectedValue(new ApiError('UNREACHABLE', 'down'));
    await signedIn();
    await expect(act(() => current.signOut())).rejects.toMatchObject({code: 'UNREACHABLE'});
    await waitFor(() => expect(current.status).toBe('in'));
  });

  it('ensureWallet refuses a wallet connected as a different account', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    vi.spyOn(api, 'getSession').mockResolvedValue(info);
    vi.spyOn(wallet, 'reconnect').mockResolvedValue(null);
    vi.spyOn(wallet, 'connect').mockResolvedValue({
      accountId: 'bob.testnet',
      wallet: {} as wallet.NearWallet,
    });
    mount();
    await screen.findByText('in:alice.testnet');
    await expect(current.ensureWallet()).rejects.toThrow(/bob.testnet, not alice.testnet/);
  });

  // Live test, 2026-11-13: every transaction on a new page opened the wallet
  // picker again, though the person had signed in with that wallet.
  it('ensureWallet reuses the wallet the browser remembers, without opening the picker', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    vi.spyOn(api, 'getSession').mockResolvedValue(info);
    const remembered = {} as wallet.NearWallet;
    vi.spyOn(wallet, 'reconnect').mockResolvedValue({accountId: 'alice.testnet', wallet: remembered});
    const picker = vi.spyOn(wallet, 'connect');
    mount();
    await screen.findByText('in:alice.testnet');
    await expect(current.ensureWallet()).resolves.toBe(remembered);
    expect(picker).not.toHaveBeenCalled();
  });

  it('ensureWallet opens the picker when the remembered wallet is another account', async () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    vi.spyOn(api, 'getSession').mockResolvedValue(info);
    vi.spyOn(wallet, 'reconnect').mockResolvedValue({
      accountId: 'bob.testnet',
      wallet: {} as wallet.NearWallet,
    });
    const chosen = {} as wallet.NearWallet;
    const picker = vi
      .spyOn(wallet, 'connect')
      .mockResolvedValue({accountId: 'alice.testnet', wallet: chosen});
    mount();
    await screen.findByText('in:alice.testnet');
    await expect(current.ensureWallet()).resolves.toBe(chosen);
    expect(picker).toHaveBeenCalledOnce();
  });
});
