import {describe, expect, it} from 'vitest';
import {credentialDate, parseCredential, tokenHref, type NftToken} from './credentials';

const extra = {
  contract: 'pactora.gopalt.testnet',
  chainJobId: '68',
  client: 'olive.testnet',
  worker: 'wade.testnet',
  amount: '4000000',
  token: 'musdc.pactora.testnet',
  specHash: 'ab'.repeat(32),
  resultHash: 'cd'.repeat(32),
  reviewHash: null,
  settledAt: '2026-11-02T10:00:00.000Z',
};

const token = (over: Partial<NftToken['metadata']> = {}): NftToken => ({
  token_id: '68',
  owner_id: 'wade.testnet',
  metadata: {
    title: 'Pactora job #68',
    description: 'A paid job on Pactora',
    media: null,
    issued_at: '1762077600000',
    extra: JSON.stringify(extra),
    ...over,
  },
});

describe('parseCredential', () => {
  it('reads the job, the parties and the amount from the token’s extra', () => {
    expect(parseCredential(token())).toMatchObject({
      tokenId: '68',
      title: 'Pactora job #68',
      chainJobId: '68',
      client: 'olive.testnet',
      worker: 'wade.testnet',
      amount: '4000000',
      token: 'musdc.pactora.testnet',
      settledAt: '2026-11-02T10:00:00.000Z',
    });
  });

  it('keeps a token whose extra is missing or not JSON, with what it can say', () => {
    const bad = parseCredential(token({extra: '{not json', title: null}));
    expect(bad).toMatchObject({tokenId: '68', title: 'Credential 68', chainJobId: null, amount: null});
    expect(bad.settledAt).toBe('2025-11-02T10:00:00.000Z');
    expect(parseCredential({token_id: '7', owner_id: 'x.testnet', metadata: null})).toMatchObject({
      tokenId: '7',
      title: 'Credential 7',
      settledAt: null,
    });
  });

  it('ignores extra fields of the wrong type rather than showing them', () => {
    const odd = parseCredential(token({extra: JSON.stringify({...extra, amount: 5, chainJobId: {x: 1}})}));
    expect(odd.amount).toBeNull();
    expect(odd.chainJobId).toBeNull();
  });
});

describe('credentialDate', () => {
  it('reads an ISO time, and seconds, milliseconds or nanoseconds since 1970', () => {
    expect(credentialDate('2026-11-02T10:00:00.000Z')).toBe('2026-11-02T10:00:00.000Z');
    expect(credentialDate('1762077600')).toBe('2025-11-02T10:00:00.000Z');
    expect(credentialDate('1762077600000')).toBe('2025-11-02T10:00:00.000Z');
    expect(credentialDate('1762077600000000000')).toBe('2025-11-02T10:00:00.000Z');
    expect(credentialDate(1762077600000)).toBe('2025-11-02T10:00:00.000Z');
  });
  it('is null for anything else', () => {
    expect(credentialDate(null)).toBeNull();
    expect(credentialDate('soon')).toBeNull();
    expect(credentialDate('')).toBeNull();
  });
});

describe('tokenHref', () => {
  it('links the token on a known explorer, and nowhere else', () => {
    expect(tokenHref('https://testnet.nearblocks.io', 'credentials.gopalt.testnet', '68')).toBe(
      'https://testnet.nearblocks.io/nft-token/credentials.gopalt.testnet/68',
    );
    expect(tokenHref('https://evil.example', 'c.testnet', '1')).toBeNull();
    expect(tokenHref(null, 'c.testnet', '1')).toBeNull();
  });
});
