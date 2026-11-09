import {describe, expect, it} from 'vitest';
import {EMPTY_DRAFT, validateListing} from './listing-form';
import {applyTemplate, LISTING_TEMPLATES} from './listing-templates';

describe('the job templates (F31)', () => {
  it('are three, each with a title, description, category, mode, criteria and a price hint', () => {
    expect(LISTING_TEMPLATES).toHaveLength(3);
    for (const t of LISTING_TEMPLATES) {
      const d = applyTemplate(t);
      expect(d.title.length, t.id).toBeGreaterThan(5);
      expect(d.description.length, t.id).toBeGreaterThan(20);
      expect(d.category, t.id).not.toBe('');
      expect(d.interactionMode, t.id).not.toBe('');
      expect(d.criteria.length, t.id).toBeGreaterThan(10);
      expect(Number(d.price), t.id).toBeGreaterThan(0);
    }
  });

  it('never set the deadline: that is the poster’s own date', () => {
    for (const t of LISTING_TEMPLATES) expect(applyTemplate(t).deadline).toBe('');
  });

  it('pass every other check of the form, so only the deadline is asked for', () => {
    for (const t of LISTING_TEMPLATES) {
      const {errors} = validateListing(applyTemplate(t), {decimals: 6, now: Date.now(), symbol: 'USDC'});
      expect(Object.keys(errors), t.id).toEqual(['deadline']);
    }
  });

  it('starting from blank is the empty draft', () => {
    expect({...EMPTY_DRAFT}).toEqual(applyTemplate({id: 'blank', label: '', blurb: '', draft: {}}));
  });
});
