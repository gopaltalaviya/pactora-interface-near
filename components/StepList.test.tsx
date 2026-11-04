// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import type {RunStep} from '@/lib/api';
import {OUTCOME, StepList} from './StepList';

afterEach(cleanup);

/**
 * A step's ending is shown in words. The badges used to print the API's codes
 * ("no-candidate", "timeout"), which read as a fault in the page.
 */
describe('StepList', () => {
  const statuses = Object.keys(OUTCOME) as RunStep['status'][];

  it('has a label for every status the API can send', () => {
    expect(statuses.sort()).toEqual(
      [
        'budget-exceeded',
        'declined',
        'disputed',
        'failed',
        'no-candidate',
        'settled',
        'timeout',
        'unrecoverable',
      ].sort(),
    );
  });

  it('shows each ending as a label, with its reason, never as a code', () => {
    render(
      <StepList
        steps={statuses.map((status) => ({capability: `cap-${status}`, status, detail: `why ${status}`}))}
      />,
    );
    for (const status of statuses) {
      expect(screen.getByText(OUTCOME[status].label)).toBeTruthy();
      expect(screen.getByText(`why ${status}`)).toBeTruthy();
    }
    expect(screen.queryByText('no-candidate')).toBeNull();
    expect(screen.queryByText('budget-exceeded')).toBeNull();
  });

  it('says what happened to the first worker when a second one delivered', () => {
    render(
      <StepList
        steps={[
          {
            capability: 'market-research',
            status: 'settled',
            detail: 'paid 0.02 USDC',
            retriedAfter: 'agent 2 declined: needs a private wallet export — cancelled and refunded',
          },
        ]}
      />,
    );
    expect(screen.getByText(/First worker: agent 2 declined: needs a private wallet export/)).toBeTruthy();
  });

  it('still renders a status it does not know, as itself', () => {
    render(
      <StepList
        steps={[{capability: 'c', status: 'brand-new' as RunStep['status'], detail: 'from a newer API'}]}
      />,
    );
    expect(screen.getByText('brand-new')).toBeTruthy();
  });
});
