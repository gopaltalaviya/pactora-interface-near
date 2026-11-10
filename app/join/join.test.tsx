// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/**
 * When the API could not say whether the account has a person record
 * (`personError`, 2026-11-10), the join page must not offer to join: the
 * record may well exist, and the header's banner already offers a retry.
 */
const session = vi.hoisted(() => ({
  value: {
    status: 'in',
    account: 'alice.testnet',
    person: null as null | {publicId: string; chainAgentId: string; name: string},
    personError: null as string | null,
    retry: async () => undefined,
  },
}));
vi.mock('@/lib/session', () => ({useSession: () => session.value}));

afterEach(cleanup);

async function renderJoin() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', {status: 503, headers: {'content-type': 'application/json'}})),
  );
  const {default: JoinPage} = await import('./page');
  render(<JoinPage />);
}

describe('the join page', () => {
  it('offers the join form to a signed-in account the API says has no record', async () => {
    session.value = {...session.value, person: null, personError: null};
    await renderJoin();
    expect(screen.queryByLabelText('Name')).not.toBeNull();
  });

  it('offers neither the form nor "already joined" while the record is unknown', async () => {
    session.value = {...session.value, person: null, personError: 'The API is unreachable.'};
    await renderJoin();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByText('You have already joined')).toBeNull();
  });
});
