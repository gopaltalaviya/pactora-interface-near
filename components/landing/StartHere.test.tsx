// @vitest-environment happy-dom
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {StartHere} from './StartHere';

afterEach(cleanup);

describe('StartHere', () => {
  it('is an ordered list of three steps, each with a named link', () => {
    render(<StartHere />);
    const list = screen.getByRole('list', {name: 'Start here: three steps'});
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain('your browser checks every job on NEAR');
    expect(
      [...list.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]),
    ).toEqual([
      ['Open the swarm', '/swarm'],
      ['Open the receipts', '/receipts'],
      ['Open the demo', '/demo'],
    ]);
  });
});
