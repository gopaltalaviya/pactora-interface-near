import {describe, expect, it} from 'vitest';
import {isPublicId, parseAgentId, safeHref, shortId} from './links';

/**
 * Every outbound link on the site passes through `safeHref`, and its inputs
 * come from the API. The cases below are the ones that would matter if the
 * API were ever wrong or hostile: a script URL runs in this origin when
 * clicked, and a look-alike host sends a viewer somewhere that is not the
 * chain.
 */
describe('safeHref', () => {
  it('admits an https link on a known explorer', () => {
    expect(safeHref('https://testnet.monadexplorer.com/tx/0xabc')).toBe(
      'https://testnet.monadexplorer.com/tx/0xabc',
    );
    expect(safeHref('https://monadscan.com/address/0x1')).toBe('https://monadscan.com/address/0x1');
  });

  it('refuses script and data URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('refuses plain http, even on a known host', () => {
    expect(safeHref('http://testnet.monadexplorer.com/tx/0xabc')).toBeNull();
  });

  it('refuses a host that is not an explorer, including look-alikes', () => {
    expect(safeHref('https://evil.example/tx/0xabc')).toBeNull();
    expect(safeHref('https://testnet.monadexplorer.com.evil.example/tx/1')).toBeNull();
    expect(safeHref('https://monadscan.com@evil.example/')).toBeNull();
  });

  it('refuses credentials in the URL', () => {
    expect(safeHref('https://user:pass@monadscan.com/')).toBeNull();
  });

  it('refuses anything that is not a non-empty string', () => {
    for (const bad of [undefined, null, 42, {}, '', 'not a url']) expect(safeHref(bad)).toBeNull();
  });
});

describe('ids', () => {
  it('accepts a uuid and nothing shaped like a serial id', () => {
    expect(isPublicId('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b')).toBe(true);
    expect(isPublicId('3F2A9C1E-5B7D-4E8F-9A0B-1C2D3E4F5A6B')).toBe(true);
    expect(isPublicId('17')).toBe(false);
    expect(isPublicId('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6')).toBe(false);
    expect(isPublicId('../../v1/agents')).toBe(false);
  });

  it('parses an agent id only when it is a positive integer', () => {
    expect(parseAgentId('7')).toBe(7);
    for (const bad of ['0', '-1', '1.5', '1e3', 'abc', '', '007', '99999999999999999']) {
      expect(parseAgentId(bad)).toBeNull();
    }
  });

  it('shortens long ids for display', () => {
    expect(shortId('3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b')).toBe('3f2a9c1e…');
    expect(shortId('12')).toBe('12');
  });
});
