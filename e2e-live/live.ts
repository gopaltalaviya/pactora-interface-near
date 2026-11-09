import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, test, type Browser, type BrowserContext, type Page, type TestInfo} from '@playwright/test';

/**
 * Helpers for the LIVE browser tests: the real API, the real signer and
 * indexer, the local near-sandbox. Nothing here is a mock.
 *
 * The page's wallet is the scripted-wallet hook of lib/wallet.ts (honoured
 * only in a NEXT_PUBLIC_E2E_WALLET=1 build), but every call it gets is
 * forwarded through `exposeFunction` to the wallet service of
 * pactora-backend-near/scripts/live-ui-stack.mjs, which signs for real with
 * near-api-js and the test account's own full-access key: NEP-413 messages
 * the API verifies, and transactions that land on the sandbox.
 */

export interface Facts {
  run: string;
  api: string;
  wallet: string;
  rpc: string;
  chainId: string;
  pactora: string;
  token: string;
  arbiter: string;
  reviewers: string[];
  minStake: string;
}

const STATE =
  process.env['LIVE_STATE'] ?? resolve(__dirname, '../../pactora-backend-near/artifacts/live-ui/state.json');
export const facts: Facts = JSON.parse(readFileSync(STATE, 'utf8')) as Facts;

/** POST to the wallet service; throws with its error text. */
export async function svc<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${facts.wallet}${path}`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & {error?: string};
  if (!res.ok) throw new Error(`wallet service ${path}: ${res.status} ${json.error ?? ''}`);
  return json;
}

/** A new sandbox account with a full-access key the wallet service holds, and some mUSDC. */
export async function newAccount(name: string, opts: {near?: string; musdc?: bigint} = {}) {
  const r = await svc<{accountId: string}>('/account', {
    name,
    near: opts.near ?? '5',
    musdc: String(opts.musdc ?? 0n),
  });
  return r.accountId;
}

/** A contract view, read from the sandbox at finality. */
export async function chainView<T>(method: string, args: Record<string, unknown> = {}, contract?: string) {
  return (await svc<{value: T}>('/view', {contract: contract ?? facts.pactora, method, args})).value;
}

export const ftBalance = async (account: string) =>
  BigInt(await chainView<string>('ft_balance_of', {account_id: account}, facts.token));

export async function sqlRead<T = Record<string, unknown>>(query: string): Promise<T[]> {
  return (await svc<{rows: T[]}>('/sql-read', {query})).rows;
}

// ── the API, as a given account (real NEP-413 sign-in) ───────────────────

export async function apiSession(accountId: string): Promise<string> {
  const ch = (await apiFetch('/v1/session/challenge', {method: 'POST', body: {accountId}})) as {
    nonce: string;
    message: string;
    recipient: string;
  };
  const nonce = Array.from(Buffer.from(ch.nonce, 'hex'));
  const signed = await svc<{publicKey: string; signature: string}>('/sign-message', {
    accountId,
    message: ch.message,
    recipient: ch.recipient,
    nonce,
  });
  const s = (await apiFetch('/v1/session', {
    method: 'POST',
    body: {accountId, nonce: ch.nonce, publicKey: signed.publicKey, signature: signed.signature},
  })) as {token: string};
  return s.token;
}

export async function apiRaw(
  path: string,
  {
    method = 'GET',
    body,
    token,
    headers = {},
  }: {method?: string; body?: unknown; token?: string; headers?: Record<string, string>} = {},
) {
  return fetch(`${facts.api}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? {'content-type': 'application/json'} : {}),
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...headers,
    },
    ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
  });
}

export async function apiFetch(path: string, opts: Parameters<typeof apiRaw>[1] = {}): Promise<unknown> {
  const res = await apiRaw(path, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** prepare → sign (wallet service, for real) → confirm, retrying while the chain is not final. */
export async function personAction(
  token: string,
  accountId: string,
  jobId: string,
  action: string,
  extra: Record<string, unknown> = {},
) {
  type Prepared = {
    functionCall: {receiverId: string; methodName: string; args: unknown; gas: string; deposit: string};
  };
  let prepared = null as Prepared | null;
  for (let i = 0; i < 30 && !prepared; i++) {
    const res = await apiRaw(`/v1/jobs/${jobId}/person-actions/prepare`, {
      method: 'POST',
      token,
      body: {action, ...extra},
    });
    if (res.ok) prepared = (await res.json()) as Prepared;
    else if (res.status === 409) await new Promise((r) => setTimeout(r, 1000));
    else throw new Error(`prepare ${action}: ${res.status} ${await res.text()}`);
  }
  if (!prepared) throw new Error(`prepare ${action}: never ready`);
  const fc = prepared.functionCall;
  const [outcome] = await svc<{transaction: {hash: string}; status: unknown}[]>('/send', {
    signerId: accountId,
    transactions: [
      {
        receiverId: fc.receiverId,
        actions: [
          {
            type: 'FunctionCall',
            params: {methodName: fc.methodName, args: fc.args, gas: fc.gas, deposit: fc.deposit},
          },
        ],
      },
    ],
  });
  const txHash = outcome!.transaction.hash;
  for (let i = 0; i < 30; i++) {
    const res = await apiRaw(`/v1/jobs/${jobId}/person-actions/confirm`, {
      method: 'POST',
      token,
      body: {action, txHash},
    });
    if (res.ok) return (await res.json()) as {state: string};
    if (res.status !== 409) throw new Error(`confirm ${action}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`confirm ${action}: never final`);
}

// ── the browser, as a given account ──────────────────────────────────────

/** What the project's device emulation sets, so a second user's context looks like the first. */
function deviceOptions(info: TestInfo) {
  const u = info.project.use;
  return {
    ...(u.viewport !== undefined ? {viewport: u.viewport} : {}),
    ...(u.userAgent ? {userAgent: u.userAgent} : {}),
    ...(u.deviceScaleFactor ? {deviceScaleFactor: u.deviceScaleFactor} : {}),
    ...(u.isMobile !== undefined && info.project.name !== 'firefox' ? {isMobile: u.isMobile} : {}),
    ...(u.hasTouch !== undefined ? {hasTouch: u.hasTouch} : {}),
  };
}

export interface User {
  account: string;
  context: BrowserContext;
  page: Page;
}

/**
 * A browser context whose page has a wallet for `account`. Reduced motion is
 * set before anything renders: the pages fade in, and a click during the fade
 * sometimes does nothing under load.
 */
export async function userContext(browser: Browser, info: TestInfo, account: string | null): Promise<User> {
  const context = await browser.newContext({
    ...deviceOptions(info),
    ...(info.project.use.baseURL ? {baseURL: info.project.use.baseURL} : {}),
    reducedMotion: 'reduce',
  });
  if (account) {
    await context.exposeFunction(
      '__liveSignMessage',
      (p: {message: string; recipient: string; nonce: number[]; signerId?: string}) =>
        svc('/sign-message', {
          accountId: p.signerId ?? account,
          message: p.message,
          recipient: p.recipient,
          nonce: p.nonce,
        }),
    );
    await context.exposeFunction('__liveSend', (p: {signerId?: string; transactions: unknown[]}) =>
      svc('/send', {signerId: p.signerId ?? account, transactions: p.transactions}),
    );
    await context.addInitScript((accountId) => {
      type W = {
        __txs: unknown[];
        __pactoraTestWallet: unknown;
        __liveSignMessage: (p: unknown) => Promise<unknown>;
        __liveSend: (p: unknown) => Promise<unknown[]>;
      };
      const w = window as unknown as W;
      w.__txs = [];
      w.__pactoraTestWallet = {
        accountId,
        wallet: {
          getAccounts: async () => [{accountId}],
          signMessage: async (p: {
            message: string;
            recipient: string;
            nonce: Uint8Array;
            signerId?: string;
          }) =>
            w.__liveSignMessage({
              message: p.message,
              recipient: p.recipient,
              nonce: Array.from(p.nonce),
              signerId: p.signerId,
            }),
          signAndSendTransactions: async (p: {signerId?: string; transactions: unknown[]}) => {
            w.__txs.push(...p.transactions);
            return w.__liveSend({signerId: p.signerId, transactions: p.transactions});
          },
        },
      };
    }, account);
  }
  const page = await context.newPage();
  return {account: account ?? '', context, page};
}

/** Sign in through /signin: the API challenge, signed for real (NEP-413). */
export async function signIn(user: User) {
  const {page} = user;
  await page.goto('/signin');
  await page.getByRole('button', {name: 'Connect and sign in'}).click();
  await expect(page.getByTestId('signed-in-account')).toHaveText(user.account, {timeout: 30_000});
}

/** The page's session token (kept in sessionStorage), to check what the API then holds for it. */
export async function pageToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      const v = sessionStorage.getItem(k) ?? '';
      if (v.includes('ps_')) return v;
    }
    return null;
  });
  const token = raw ? /ps_[A-Za-z0-9_-]+/.exec(raw)?.[0] : undefined;
  if (!token) throw new Error('no session token in sessionStorage');
  return token;
}

/** Wait until `check` holds (chain or indexer catching up). */
export async function eventually<T>(
  check: () => Promise<T>,
  ok: (v: T) => boolean,
  what: string,
  ms = 60_000,
) {
  const end = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < end) {
    last = await check();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what}: still ${JSON.stringify(last)}`);
}

/** A 1×1 PNG carrying `mark` in an eXIf chunk (a stand-in for a GPS block). */
export function pngWithMark(mark: string): Buffer {
  const crcTable = Array.from({length: 256}, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  // zlib stream of one scanline: filter 0, RGB 200,120,40 (stored block).
  const raw = Buffer.from([0, 200, 120, 40]);
  const adler = (() => {
    let a = 1;
    let b = 0;
    for (const x of raw) {
      a = (a + x) % 65521;
      b = (b + a) % 65521;
    }
    const out = Buffer.alloc(4);
    out.writeUInt32BE(((b << 16) | a) >>> 0);
    return out;
  })();
  const idat = Buffer.concat([Buffer.from([0x78, 0x01, 0x01, 0x04, 0x00, 0xfb, 0xff]), raw, adler]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('eXIf', Buffer.from(`MM\0*\0\0\0\x08${mark}\0`, 'latin1')),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A screenshot of a real page for the README and the demo post, saved only
 * when LIVE_SHOTS_DIR is set and only in chromium (one set, not five).
 */
export async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.LIVE_SHOTS_DIR;
  if (!dir || test.info().project.name !== 'chromium') return;
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({path: `${dir}/${name}.png`, fullPage: false});
}

/** Every visible header control ends inside the viewport (real account ids and network names are long). */
export async function expectHeaderFits(page: Page): Promise<void> {
  // The bell's unread count and the account chip load after the page: settle first.
  await page.waitForLoadState('networkidle').catch(() => {});
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('header a, header button')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({text: (e.textContent ?? '').trim().slice(0, 24), right: e.getBoundingClientRect().right}))
      .filter((x) => x.right > window.innerWidth + 0.5),
  );
  expect(clipped, `header items past the right edge at ${page.viewportSize()?.width}px`).toEqual([]);
}
