import {describe, expect, it} from 'vitest';
import {
  bytesDisplay,
  criteriaToChecks,
  gateForDrafts,
  EVIDENCE_LIMITS,
  listingTermsOf,
  sha256OfBlob,
  validateDraftText,
  validateMessage,
  validatePhoto,
  validateReview,
  type ReviewCheck,
} from './evidence';

const met = (criterion: string, ok = true): ReviewCheck => ({criterion, met: ok, support: ''});

describe('listingTermsOf', () => {
  it('reads the listing a bid job was made from', () => {
    const spec = {
      capability: 'photography',
      input: {listing: {title: 'Shop fronts', criteria: 'Both fronts', description: 'Two photos'}},
    };
    expect(listingTermsOf({spec})).toEqual({
      title: 'Shop fronts',
      criteria: 'Both fronts',
      description: 'Two photos',
    });
  });

  it('is null for an ordinary agent job, a missing spec, or a listing without criteria', () => {
    expect(listingTermsOf({spec: null})).toBeNull();
    expect(listingTermsOf({spec: {capability: 'x', input: {q: 1}}})).toBeNull();
    expect(listingTermsOf({spec: {input: 'text'}})).toBeNull();
    expect(listingTermsOf({spec: {input: {listing: {title: 'no criteria'}}}})).toBeNull();
  });
});

describe('criteriaToChecks', () => {
  it('makes one check per line, dropping list markers and blank lines', () => {
    expect(
      criteriaToChecks('- Whole front\n\n* Sign readable\n• In focus\n1. Daylight\n2) Two photos'),
    ).toEqual(['Whole front', 'Sign readable', 'In focus', 'Daylight', 'Two photos']);
  });

  it('keeps a one-line criteria text as one check, with its whitespace collapsed', () => {
    expect(criteriaToChecks('  Each photo   shows the sign.  ')).toEqual(['Each photo shows the sign.']);
  });

  it('keeps a number that is not a list marker', () => {
    expect(criteriaToChecks('2 photos, not 1')).toEqual(['2 photos, not 1']);
  });

  it('cuts each check to 500 characters and keeps at most 30', () => {
    const many = Array.from({length: 40}, (_, i) => `c${i}`).join('\n');
    expect(criteriaToChecks(many)).toHaveLength(30);
    expect(criteriaToChecks('x'.repeat(600))[0]).toHaveLength(500);
  });

  it('is empty for empty criteria', () => {
    expect(criteriaToChecks(' \n \n')).toEqual([]);
  });
});

describe('validateReview', () => {
  it('accepts a full acceptance', () => {
    expect(validateReview('accept_draft', 'All good, both fronts.', [met('a'), met('b')], 3)).toBeNull();
  });

  it('refuses accept_draft with any check unmet, whatever the reason says', () => {
    expect(validateReview('accept_draft', 'Good enough for me.', [met('a'), met('b', false)], 3)).toMatch(
      /every check met/,
    );
  });

  it('refuses a fourth revision but still allows accepting or disputing', () => {
    expect(validateReview('revise', 'Please redo the second.', [met('a', false)], 0)).toMatch(/3 revisions/);
    expect(validateReview('dispute_intent', 'Nothing usable here.', [met('a', false)], 0)).toBeNull();
  });

  it('holds the reason to 10-2000 characters, trimmed', () => {
    expect(validateReview('revise', '   short   ', [met('a', false)], 3)).toMatch(/10-2000/);
    expect(validateReview('revise', 'x'.repeat(2001), [met('a', false)], 3)).toMatch(/10-2000/);
    expect(validateReview('revise', 'x'.repeat(10), [met('a', false)], 3)).toBeNull();
  });

  it('needs 1-30 checks, each with a criterion', () => {
    expect(validateReview('revise', 'Redo the photos.', [], 3)).toMatch(/at least one/);
    const tooMany = Array.from({length: 31}, (_, i) => met(`c${i}`));
    expect(validateReview('dispute_intent', 'Redo the photos.', tooMany, 3)).toMatch(/At most 30/);
    expect(validateReview('revise', 'Redo the photos.', [met('  ', false)], 3)).toMatch(/criterion/);
  });
});

describe('the other validators', () => {
  it('draft text is 10-10000 characters, trimmed', () => {
    expect(validateDraftText('  too short ')).not.toBeNull();
    expect(validateDraftText('Both fronts done.')).toBeNull();
    expect(validateDraftText('x'.repeat(EVIDENCE_LIMITS.draftText.max + 1))).not.toBeNull();
  });

  it('a message is not blank and at most 4000 characters (counted untrimmed, as the API does)', () => {
    expect(validateMessage('   ')).toMatch(/Write/);
    expect(validateMessage('ok')).toBeNull();
    expect(validateMessage('x'.repeat(4000))).toBeNull();
    expect(validateMessage('x'.repeat(4001))).toMatch(/4000/);
  });

  it('a photo is PNG, JPEG or WebP, not empty, at most 8 MiB', () => {
    expect(validatePhoto({size: 10, type: 'image/png'})).toBeNull();
    expect(validatePhoto({size: 10, type: 'image/gif'})).toMatch(/PNG, JPEG or WebP/);
    expect(validatePhoto({size: 8 * 1024 * 1024, type: 'image/jpeg'})).toBeNull();
    expect(validatePhoto({size: 8 * 1024 * 1024 + 1, type: 'image/jpeg'})).toMatch(/8 MiB/);
    expect(validatePhoto({size: 0, type: 'image/webp'})).toMatch(/empty/);
  });
});

describe('display helpers', () => {
  it('bytesDisplay', () => {
    expect(bytesDisplay(512)).toBe('512 B');
    expect(bytesDisplay(1536)).toBe('1.5 KiB');
    expect(bytesDisplay(2048)).toBe('2 KiB');
    expect(bytesDisplay(8 * 1024 * 1024)).toBe('8 MiB');
  });

  it('sha256OfBlob matches a known digest', async () => {
    expect(await sha256OfBlob(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('gateForDrafts', () => {
  const all = ['accept', 'submit', 'approve', 'dispute', 'cancel'] as const;
  const page = (phase: string, readyToApprove = false) =>
    ({phase, readyToApprove}) as unknown as Parameters<typeof gateForDrafts>[1];

  it('leaves an ordinary job alone', () => {
    expect(gateForDrafts([...all], undefined)).toEqual([...all]);
  });

  it('hides submit and approve while the drafts are not read yet', () => {
    expect(gateForDrafts([...all], null)).toEqual(['accept', 'dispute', 'cancel']);
  });

  it('offers submit only once a draft is accepted', () => {
    expect(gateForDrafts(['submit'], page('awaiting_review'))).toEqual([]);
    expect(gateForDrafts(['submit'], page('revise'))).toEqual([]);
    expect(gateForDrafts(['submit'], page('accepted'))).toEqual(['submit']);
  });

  it('offers approve only when the chain holds the accepted hash', () => {
    expect(gateForDrafts(['approve', 'dispute'], page('accepted', false))).toEqual(['dispute']);
    expect(gateForDrafts(['approve', 'dispute'], page('accepted', true))).toEqual(['approve', 'dispute']);
  });
});
