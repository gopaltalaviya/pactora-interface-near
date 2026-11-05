import {describe, expect, it} from 'vitest';
import {contentSecurityPolicy} from './csp.mjs';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('the Content Security Policy', () => {
  const csp = contentSecurityPolicy('https://api.example.invalid/', false, {});

  it('lets the page reach the API and the NEAR testnet RPC, and no Monad RPC', () => {
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('https://api.example.invalid');
    expect(connect).toContain('https://rpc.testnet.near.org');
    expect(connect.join(' ')).not.toMatch(/monad/);
  });

  it('lets NEAR Connect load its wallet manifest and wallet code', () => {
    const connect = directive(csp, 'connect-src');
    expect(connect).toContain('https://raw.githubusercontent.com');
    expect(connect).toContain('https://cdn.jsdelivr.net');
  });

  it('takes the RPC and wallet origins from the environment when set', () => {
    const custom = contentSecurityPolicy('https://api.example.invalid', false, {
      NEXT_PUBLIC_RPC_ORIGINS: 'https://rpc.example',
      NEXT_PUBLIC_WALLET_ORIGINS: 'https://wallet.example, https://cdn.example',
    });
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
});
