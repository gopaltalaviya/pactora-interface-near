import {describe, expect, it} from 'vitest';
import {contentSecurityPolicy} from './csp.mjs';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('the Content Security Policy', () => {
  const NONCE = 'dGVzdC1ub25jZS0xMjM0NTY3OA==';
  const csp = contentSecurityPolicy('https://api.example.invalid/', false, {}, NONCE);

  it('lets the page reach the API and the NEAR testnet RPC, and no other RPC', () => {
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('https://api.example.invalid');
    expect(connect).toContain('https://rpc.testnet.near.org');
    expect(connect.filter((o) => /rpc/i.test(o))).toEqual([
      'https://rpc.testnet.near.org',
      'https://test.rpc.fastnear.com',
    ]);
  });

  it('lets NEAR Connect load its wallet manifest and wallet code', () => {
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('https://raw.githubusercontent.com');
    expect(connect).toContain('https://cdn.jsdelivr.net');
  });

  it('takes the RPC and wallet origins from the environment when set', () => {
    const custom = contentSecurityPolicy(
      'https://api.example.invalid',
      false,
      {
        NEXT_PUBLIC_RPC_ORIGINS: 'https://rpc.example',
        NEXT_PUBLIC_WALLET_ORIGINS: 'https://wallet.example, https://cdn.example',
      },
      NONCE,
    );
    const connect = directive(custom, 'connect-src');
    expect(connect).toEqual([
      "'self'",
      'https://api.example.invalid',
      'https://rpc.example',
      'https://wallet.example',
      'https://cdn.example',
    ]);
  });

  it('keeps eval out of production and the page out of frames', () => {
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
  });

  it('allows scripts by nonce only: no unsafe-inline, strict-dynamic for the chunks a nonced script loads', () => {
    const script = directive(csp, 'script-src');
    expect(script).toContain(`'nonce-${NONCE}'`);
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(() => contentSecurityPolicy('https://api.example.invalid', false, {}, '')).toThrow(/nonce/);
    expect(() =>
      contentSecurityPolicy('https://api.example.invalid', false, {}, "x' 'unsafe-inline"),
    ).toThrow(/nonce/);
  });
});
