import {describe, expect, it} from 'vitest';
import {EMAIL_FALLBACK, OPERATOR_FALLBACK, operatorName, readSite} from './site';

/**
 * Who runs the service and how to reach them come from three public env vars.
 * Until the owner sets them, the site must say so plainly — never show an
 * empty link, a made-up address, or an X link to a handle nobody holds.
 */
describe('readSite', () => {
  it('with nothing set: no email, no X, and the operator named as a placeholder', () => {
    const site = readSite({});
    expect(site.contactEmail).toBeNull();
    expect(site.x).toBeNull();
    expect(site.operatorName).toBeNull();
    expect(operatorName(site)).toBe(OPERATOR_FALLBACK);
    expect(OPERATOR_FALLBACK).toBe('the Pactora operator ([name to be confirmed])');
    expect(EMAIL_FALLBACK).toBe('Email address coming soon — use GitHub meanwhile');
  });

  it('treats blank values as unset', () => {
    const site = readSite({
      NEXT_PUBLIC_CONTACT_EMAIL: '  ',
      NEXT_PUBLIC_X_HANDLE: '',
      NEXT_PUBLIC_OPERATOR_NAME: ' ',
    });
    expect(site).toEqual({contactEmail: null, x: null, operatorName: null});
  });

  it('uses the values once they are set', () => {
    const site = readSite({
      NEXT_PUBLIC_CONTACT_EMAIL: ' hello@example.com ',
      NEXT_PUBLIC_X_HANDLE: '@pactora',
      NEXT_PUBLIC_OPERATOR_NAME: 'Example Ltd',
    });
    expect(site.contactEmail).toBe('hello@example.com');
    expect(site.x).toEqual({handle: 'pactora', url: 'https://x.com/pactora'});
    expect(operatorName(site)).toBe('Example Ltd');
  });

  it('refuses a value that is not an email or an X handle, rather than linking it', () => {
    const site = readSite({
      NEXT_PUBLIC_CONTACT_EMAIL: 'javascript:alert(1)',
      NEXT_PUBLIC_X_HANDLE: 'https://evil.example/x',
    });
    expect(site.contactEmail).toBeNull();
    expect(site.x).toBeNull();
    expect(readSite({NEXT_PUBLIC_X_HANDLE: 'much_too_long_a_handle'}).x).toBeNull();
  });
});
