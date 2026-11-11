// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {IDENTITY_OPTIONAL_NOTE, identitySkipped, setIdentitySkipped} from './identity-skip';

describe('skipping the identity check (2026-11-10)', () => {
  beforeEach(() => window.localStorage.clear());

  it('is remembered per account and undone by verifying', () => {
    expect(identitySkipped('sam.testnet')).toBe(false);
    setIdentitySkipped('sam.testnet', true);
    expect(identitySkipped('sam.testnet')).toBe(true);
    expect(identitySkipped('olive.testnet')).toBe(false);
    setIdentitySkipped('sam.testnet', false);
    expect(identitySkipped('sam.testnet')).toBe(false);
  });

  it('tells judges the check is optional, simulated, and that screening still runs', () => {
    expect(IDENTITY_OPTIONAL_NOTE).toMatch(/optional/);
    expect(IDENTITY_OPTIONAL_NOTE).toMatch(/skip/);
    expect(IDENTITY_OPTIONAL_NOTE).toMatch(/simulated/);
    expect(IDENTITY_OPTIONAL_NOTE).toMatch(/[Ss]anctions screening/);
  });

  it('no page claims that work needs a verified identity (the API requires none)', () => {
    const root = join(__dirname, '..');
    for (const p of ['components/market/Identity.tsx', 'app/docs/people/page.tsx', 'app/privacy/page.tsx']) {
      expect(readFileSync(join(root, p), 'utf8')).not.toMatch(
        /needs? a verified identity|may need a verified/,
      );
    }
  });
});
