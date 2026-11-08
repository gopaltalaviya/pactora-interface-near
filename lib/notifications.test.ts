import {describe, expect, it} from 'vitest';
import {badgeText, bellLabel, notificationText} from './notifications';

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
});
