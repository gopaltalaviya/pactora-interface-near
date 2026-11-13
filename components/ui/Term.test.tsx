// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {GLOSSARY, termHref, type TermName} from '@/lib/terms-glossary';
import {scoreText} from '@/app/jobs/listing/[id]/ListingView';
import {Term} from './Term';

afterEach(cleanup);

// Live audit, 2026-11-13: purse, stake, keeper and the rest were used with no
// explanation, and almost nothing linked to the concepts page.
describe('Term', () => {
  it('links to its concepts section, with the meaning on hover and for screen readers', () => {
    render(<Term name="purse" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/docs/concepts#purse');
    expect(link.getAttribute('title')).toBe(GLOSSARY.purse.meaning);
    expect(link.textContent).toContain('purse');
    expect(link.textContent).toContain(GLOSSARY.purse.meaning);
  });

  it('shows custom text when given', () => {
    render(<Term name="keeper">What is the keeper?</Term>);
    expect(screen.getByRole('link').textContent).toContain('What is the keeper?');
  });

  it('every term has a meaning and an anchor', () => {
    for (const name of Object.keys(GLOSSARY) as TermName[]) {
      expect(GLOSSARY[name].meaning.length).toBeGreaterThan(20);
      expect(termHref(name)).toMatch(/^\/docs\/concepts#[a-z]+$/);
    }
  });
});

describe('scoreText', () => {
  it('says the score out of 100 once there is a record, and "unproven" before', () => {
    expect(scoreText(3, 72)).toBe('score 72/100');
    expect(scoreText(0, 50)).toBe('unproven');
  });
});
