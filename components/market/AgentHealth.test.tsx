// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {AgentHealthBadges, LOW_STORAGE_YOCTO, storageLow} from './AgentHealth';

afterEach(cleanup);

// Live test, 2026-11-13: "accepting work" was shown for an agent with no stake,
// and an agent ran out of storage with no warning before its jobs failed.
describe('agent health', () => {
  it('warns below 0.01 NEAR of storage, not at or above it, and not when unread', () => {
    expect(storageLow(LOW_STORAGE_YOCTO - 1n)).toBe(true);
    expect(storageLow(LOW_STORAGE_YOCTO)).toBe(false);
    expect(storageLow(null)).toBe(false);
  });

  it('says not hireable instead of accepting work when the stake is below the minimum', () => {
    render(<AgentHealthBadges active health={{hireable: false, storage: 10n ** 23n}} />);
    expect(screen.getByText('not hireable: stake below the minimum')).toBeTruthy();
    expect(screen.queryByText('accepting work')).toBeNull();
  });

  it('shows the low-storage warning with what is left', () => {
    render(<AgentHealthBadges active health={{hireable: true, storage: 200_000_000_000_000_000_000n}} />);
    expect(screen.getByText('accepting work')).toBeTruthy();
    expect(screen.getByTestId('storage-low').textContent).toContain('0.0002 NEAR left');
  });

  it('a paused agent says paused', () => {
    render(<AgentHealthBadges active={false} health={null} />);
    expect(screen.getByText('paused')).toBeTruthy();
  });
});
