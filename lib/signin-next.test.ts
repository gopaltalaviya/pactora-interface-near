import {describe, expect, it} from 'vitest';
import {safeNext, signInHref} from './signin-next';

/**
 * `/signin?next=…` brings a person back to where they were. Only a path on
 * this site is honoured: anything that could leave it (another origin, a
 * protocol-relative `//host`, a backslash a browser may read as a slash) is
 * dropped, and the page falls back to its own default.
 */
describe('safeNext', () => {
  it('accepts a relative path on this site, with its query and hash', () => {
    expect(safeNext('/jobs/abc')).toBe('/jobs/abc');
    expect(safeNext('/jobs/listing/lst-1?sort=rating#bids')).toBe('/jobs/listing/lst-1?sort=rating#bids');
    expect(safeNext('/')).toBe('/');
  });

  it('rejects anything that is not a single-slash path', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'jobs',
      '//evil.example/x',
      '/\\evil.example',
      'https://evil.example/',
      'http://evil.example/',
      'javascript:alert(1)',
      '/%2F%2Fevil.example',
      ' /jobs',
      '/jobs\nx',
    ]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });

  it('never points back at the sign-in page itself', () => {
    expect(safeNext('/signin')).toBeNull();
    expect(safeNext('/signin?next=/jobs')).toBeNull();
  });
});

describe('signInHref', () => {
  it('carries the current path, encoded, and nothing that is not a path', () => {
    expect(signInHref('/jobs/abc')).toBe('/signin?next=%2Fjobs%2Fabc');
    expect(signInHref('/jobs/listing/lst-1?sort=rating')).toBe(
      '/signin?next=%2Fjobs%2Flisting%2Flst-1%3Fsort%3Drating',
    );
    expect(signInHref('/signin')).toBe('/signin');
    expect(signInHref(null)).toBe('/signin');
    expect(signInHref('//evil.example')).toBe('/signin');
  });
});
