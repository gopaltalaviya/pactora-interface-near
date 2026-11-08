import {describe, expect, it} from 'vitest';
import {ApiError} from './api';
import {
  classifyFailure,
  EMPTY_DRAFT,
  keyForSend,
  MAX_WORK_WINDOW_MINUTES,
  newKeyState,
  parseSkills,
  validateBid,
  validateListing,
  validateReason,
  type ListingDraft,
} from './listing-form';

const NOW = Date.parse('2026-11-08T10:00:00Z');
const ctx = {decimals: 6, now: NOW, symbol: 'USDC'};
const good: ListingDraft = {
  ...EMPTY_DRAFT,
  title: 'Photograph the shopfront',
  description: 'Two photos of the shopfront at 12 Main Street, daylight.',
  category: 'physical',
  interactionMode: 'capture',
  skills: 'Photography, photography,  Street View ',
  location: ' Pune ',
  price: '2.5',
  maxWorkers: '3',
  estimatedMinutes: '45',
  deadline: '2026-11-09T18:00',
  criteria: 'Both photos are sharp and show the whole sign.',
};

describe('validateListing', () => {
  it('turns a good draft into the API body, trimmed, in base units, with skills de-duplicated', () => {
    const {errors, body} = validateListing(good, ctx);
    expect(errors).toEqual({});
    expect(body).toEqual({
      title: 'Photograph the shopfront',
      description: 'Two photos of the shopfront at 12 Main Street, daylight.',
      category: 'physical',
      interactionMode: 'capture',
      skills: ['photography', 'street view'],
      location: 'Pune',
      maxPriceBaseUnits: '2500000',
      maxWorkers: 3,
      hiringMode: 'applications',
      estimatedMinutes: 45,
      deadline: new Date('2026-11-09T18:00').toISOString(),
      criteria: 'Both photos are sharp and show the whole sign.',
    });
  });

  it('says what is wrong beside each field, and sends nothing', () => {
    const {errors, body} = validateListing(EMPTY_DRAFT, ctx);
    expect(body).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      [
        'category',
        'criteria',
        'deadline',
        'description',
        'estimatedMinutes',
        'interactionMode',
        'price',
        'title',
      ].sort(),
    );
  });

  it('mirrors the API’s limits', () => {
    const bad = (over: Partial<ListingDraft>) => validateListing({...good, ...over}, ctx).errors;
    expect(bad({title: 'abcd'}).title).toMatch(/at least 5/);
    expect(bad({title: 'x'.repeat(141)}).title).toMatch(/at most 140/);
    expect(bad({description: 'short'}).description).toMatch(/at least 10/);
    expect(bad({criteria: 'x'.repeat(3001)}).criteria).toMatch(/at most 3000/);
    expect(bad({maxWorkers: '0'}).maxWorkers).toBeDefined();
    expect(bad({maxWorkers: '21'}).maxWorkers).toBeDefined();
    expect(bad({maxWorkers: '1.5'}).maxWorkers).toBeDefined();
    expect(bad({estimatedMinutes: '10081'}).estimatedMinutes).toBeDefined();
    expect(bad({location: 'x'.repeat(121)}).location).toBeDefined();
    expect(bad({skills: 'a'}).skills).toMatch(/2-50/);
    expect(bad({skills: Array.from({length: 21}, (_, i) => `skill${i}`).join(',')}).skills).toMatch(/20/);
    expect(bad({price: '0'}).price).toBeDefined();
    expect(bad({price: '1.1234567'}).price).toBeDefined();
    expect(bad({price: '-3'}).price).toBeDefined();
    expect(validateListing(good, ctx).errors).toEqual({});
  });

  it('checks the price against the escrow’s smallest and largest job when the network says', () => {
    const limits = {...ctx, minJobAmount: '10000', maxJobAmount: '10000000'};
    expect(validateListing({...good, price: '0.005'}, limits).errors.price).toMatch(
      /smallest job is 0\.01 USDC/,
    );
    expect(validateListing({...good, price: '10.5'}, limits).errors.price).toMatch(/largest job is 10 USDC/);
    expect(validateListing({...good, price: '0.01'}, limits).errors.price).toBeUndefined();
  });

  it('wants a future deadline', () => {
    expect(validateListing({...good, deadline: '2026-11-08T09:00'}, ctx).errors.deadline).toMatch(/future/);
    expect(validateListing({...good, deadline: 'nonsense'}, ctx).errors.deadline).toBeDefined();
  });

  it('caps the work window at 5 hours and explains why; the accept window only has to be positive', () => {
    const over = validateListing({...good, workMinutes: String(MAX_WORK_WINDOW_MINUTES + 1)}, ctx);
    expect(over.body).toBeNull();
    expect(over.errors.workMinutes).toMatch(/5 hours.*testnet/);
    const ok = validateListing({...good, workMinutes: '300', acceptMinutes: '90'}, ctx);
    expect(ok.body).toMatchObject({workWindowSeconds: 18000, acceptWindowSeconds: 5400});
    expect(validateListing({...good, acceptMinutes: '0'}, ctx).errors.acceptMinutes).toBeDefined();
    // Left empty, the windows are not sent: the chain's defaults apply.
    expect(validateListing(good, ctx).body).not.toHaveProperty('workWindowSeconds');
  });

  it('sends instant hiring when asked', () => {
    expect(validateListing({...good, hiringMode: 'instant'}, ctx).body?.hiringMode).toBe('instant');
  });
});

describe('parseSkills', () => {
  it('lowercases, collapses spaces, drops empties and repeats', () => {
    expect(parseSkills(' Rust,  rust ,,Data   Entry')).toEqual(['rust', 'data entry']);
    expect(parseSkills('')).toEqual([]);
  });
});

describe('validateBid', () => {
  const bidCtx = {decimals: 6, ceiling: '5000000'};
  const proposal = 'I can be there on Tuesday morning with a good camera.';
  it('accepts a price at or under the ceiling and a proposal of 20+ characters', () => {
    expect(validateBid('5', proposal, bidCtx).body).toEqual({priceBaseUnits: '5000000', proposal});
    expect(validateBid('4.25', proposal, bidCtx).body?.priceBaseUnits).toBe('4250000');
  });
  it('refuses a price above the ceiling, a short proposal, and a missing price', () => {
    expect(validateBid('5.000001', proposal, bidCtx).errors.price).toMatch(/ceiling/);
    expect(validateBid('2', 'too short', bidCtx).errors.proposal).toMatch(/at least 20/);
    expect(validateBid('', proposal, bidCtx).errors.price).toBeDefined();
    expect(validateBid('2', 'x'.repeat(3001), bidCtx).errors.proposal).toMatch(/at most 3000/);
  });
});

describe('validateReason', () => {
  it('wants 10 to 2000 characters', () => {
    expect(validateReason('too short')).toMatch(/at least 10/);
    expect(validateReason('a'.repeat(2001))).toMatch(/at most 2000/);
    expect(validateReason('this one is long enough')).toBeNull();
  });
});

describe('the idempotency key', () => {
  let n = 0;
  const fresh = () => `key-${++n}`;

  it('is made once and reused for the same body, however often it is sent', () => {
    n = 0;
    let state = newKeyState(fresh);
    state = keyForSend(state, '{"a":1}', fresh);
    state = keyForSend(state, '{"a":1}', fresh);
    expect(state.key).toBe('key-1');
    expect(n).toBe(1);
  });

  it('is kept when the body changes after an outcome nobody knows (it may have been posted)', () => {
    n = 0;
    let state = newKeyState(fresh);
    state = keyForSend(state, '{"a":1}', fresh);
    state = {...state, outcome: classifyFailure(new ApiError('UNREACHABLE', 'offline'))};
    state = keyForSend(state, '{"a":2}', fresh);
    expect(state.key).toBe('key-1');
  });

  it('is replaced when the API refused the last body and the person changed it', () => {
    n = 0;
    let state = newKeyState(fresh);
    state = keyForSend(state, '{"a":1}', fresh);
    state = {...state, outcome: classifyFailure(new ApiError('VALIDATION', 'bad', 400))};
    expect(keyForSend(state, '{"a":1}', fresh).key).toBe('key-1');
    expect(keyForSend(state, '{"a":2}', fresh).key).toBe('key-2');
  });

  it('classifies failures', () => {
    expect(classifyFailure(new ApiError('LIMIT_REACHED', 'x', 409))).toBe('rejected');
    expect(classifyFailure(new ApiError('INSUFFICIENT_FUNDS', 'x', 402))).toBe('rejected');
    expect(classifyFailure(new ApiError('UPSTREAM_UNAVAILABLE', 'x', 503))).toBe('uncertain');
    expect(classifyFailure(new Error('boom'))).toBe('uncertain');
  });
});
