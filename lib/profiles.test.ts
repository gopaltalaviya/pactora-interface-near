import {describe, expect, it} from 'vitest';
import {authorText, isRevealed, ratingText, starsOf, validatePartyReview, validateProfile} from './profiles';

describe('ratingText and starsOf', () => {
  it('says the average and the count, or that there are none', () => {
    expect(ratingText({average: null, count: 0})).toBe('No reviews yet');
    expect(ratingText({average: 4, count: 0})).toBe('No reviews yet');
    expect(ratingText({average: 5, count: 1})).toBe('5 out of 5 from 1 review');
    expect(ratingText({average: 4.333, count: 3})).toBe('4.3 out of 5 from 3 reviews');
  });

  it('fills the stars to the rounded rating, within 0-5', () => {
    expect(starsOf(4.4)).toBe('★★★★☆');
    expect(starsOf(4.5)).toBe('★★★★★');
    expect(starsOf(0)).toBe('☆☆☆☆☆');
    expect(starsOf(9)).toBe('★★★★★');
  });
});

describe('authorText', () => {
  it('uses a published name, else the side they were on', () => {
    expect(authorText({author: 'Priya', authorRole: 'client'})).toBe('Priya');
    expect(authorText({author: null, authorRole: 'client'})).toBe('A client');
    expect(authorText({author: null, authorRole: 'worker'})).toBe('A worker');
  });
});

describe('the forms', () => {
  const ok = {displayName: 'Priya', headline: '', bio: '', showAccount: false, published: true};
  it('checks the profile as the API does, trimmed', () => {
    expect(validateProfile(ok)).toBeNull();
    expect(validateProfile({...ok, displayName: '   '})).toMatch(/display name/);
    expect(validateProfile({...ok, displayName: 'x'.repeat(61)})).toMatch(/60/);
    expect(validateProfile({...ok, headline: 'x'.repeat(141)})).toMatch(/140/);
    expect(validateProfile({...ok, bio: 'x'.repeat(2001)})).toMatch(/2000/);
    expect(validateProfile({...ok, bio: `  ${'x'.repeat(2000)}  `})).toBeNull();
  });

  it('checks a review: a whole rating 1-5 and 10-2000 characters', () => {
    expect(validatePartyReview(5, 'All done well.')).toBeNull();
    expect(validatePartyReview(0, 'All done well.')).toMatch(/1 to 5/);
    expect(validatePartyReview(3.5, 'All done well.')).toMatch(/1 to 5/);
    expect(validatePartyReview(4, '  short  ')).toMatch(/10-2000/);
  });

  it('tells a revealed review from a blind one', () => {
    expect(isRevealed(null)).toBe(false);
    expect(isRevealed({submitted: true})).toBe(false);
    expect(
      isRevealed({reviewId: 'r', rating: 4, body: 'x', authorRole: 'client', at: '', hidden: false}),
    ).toBe(true);
  });
});
