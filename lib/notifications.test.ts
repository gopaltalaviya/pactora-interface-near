import {describe, expect, it} from 'vitest';
import {badgeText, bellLabel, groupNotifications, notificationHref, notificationText} from './notifications';

describe('the header badge', () => {
  it('says nothing at zero, the count up to 99, then 99+', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-3)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });

  it('names the link with the count, for a screen reader', () => {
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(4)).toBe('Notifications, 4 unread');
    expect(bellLabel(250)).toBe('Notifications, 99+ unread');
  });
});

describe('notificationText', () => {
  it('uses the job history’s words, and says which side the person is on', () => {
    expect(notificationText({kind: 'job.draft.reviewed', role: 'worker'})).toBe(
      'Draft reviewed by the client — you are the worker',
    );
    expect(notificationText({kind: 'settled', role: 'client'})).toBe('Settled on chain — you are the client');
  });

  it('shows a kind it does not know as the API named it', () => {
    expect(notificationText({kind: 'job.something_new', role: 'client'})).toBe(
      'job.something_new — you are the client',
    );
  });

  it('names the listing events: a bid says who bid, a selection speaks of your bid, a match stands alone', () => {
    expect(
      notificationText({kind: 'listing.bid', role: 'client', payload: {applicant: {name: 'Wade'}}}),
    ).toBe('New bid on your listing from Wade — you are the client');
    expect(notificationText({kind: 'application.selected', role: 'applicant'})).toBe(
      'Your bid was selected — your bid',
    );
    expect(notificationText({kind: 'listing.match', role: 'match'})).toBe(
      'A new listing matches your skills',
    );
  });
});

describe('where a notification leads, and how they group', () => {
  const n = (over: Partial<Parameters<typeof groupNotifications>[0][number]>) => ({
    seq: 1,
    kind: 'job.created',
    role: 'client' as const,
    jobId: null,
    payload: {},
    at: '2026-11-03T09:00:00.000Z',
    read: false,
    ...over,
  });

  it('links a job item to the job and a listing item to the listing; an account item to nothing', () => {
    expect(notificationHref({jobId: 'j1', listingId: 'l1'})).toEqual({
      href: '/jobs/j1',
      label: 'Open the job',
    });
    expect(notificationHref({jobId: null, listingId: 'lst a'})).toEqual({
      href: '/jobs/listing/lst%20a',
      label: 'Open the listing',
    });
    expect(notificationHref({jobId: null, listingId: null})).toBeNull();
  });

  it('groups by job or listing, titled, in the order of the newest item', () => {
    const groups = groupNotifications([
      n({seq: 5, jobId: 'j1', jobTitle: 'Photograph two shop fronts'}),
      n({seq: 4, listingId: 'l1', listingTitle: 'Bid on me', kind: 'listing.bid'}),
      n({seq: 3, jobId: 'j1', jobTitle: 'Photograph two shop fronts'}),
      n({seq: 2, kind: 'account.warned'}),
    ]);
    expect(groups.map((g) => [g.title, g.items.map((x) => x.seq)])).toEqual([
      ['Photograph two shop fronts', [5, 3]],
      ['Bid on me', [4]],
      ['Your account', [2]],
    ]);
    expect(groups[1]!.link).toEqual({href: '/jobs/listing/l1', label: 'Open the listing'});
    expect(groups[2]!.link).toBeNull();
  });
});
