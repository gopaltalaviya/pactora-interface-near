// @vitest-environment happy-dom
import {act, cleanup, render, screen} from '@testing-library/react';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {EXAMPLE_CHAT, TelegramPreview} from './TelegramPreview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Owner's request, 2026-11-13: show what the Telegram bot looks like, with made-up data. */
describe('TelegramPreview', () => {
  it('shows the whole example chat at once without IntersectionObserver (reduced motion too)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<TelegramPreview />);
    expect(screen.getAllByRole('listitem')).toHaveLength(EXAMPLE_CHAT.length);
    expect(screen.getByText('Example chat')).toBeTruthy();
    expect(screen.getByText(/Made-up data/)).toBeTruthy();
    expect(screen.getByText('@PactoraJobsBot · bot')).toBeTruthy();
  });

  it('plays the chat one message at a time once it is in view', () => {
    vi.useFakeTimers();
    let fire: ((e: {isIntersecting: boolean}[]) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: {isIntersecting: boolean}[]) => void) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      render(<TelegramPreview />);
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
      act(() => fire!([{isIntersecting: true}]));
      act(() => void vi.advanceTimersByTime(650 * 2));
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      act(() => void vi.advanceTimersByTime(650 * EXAMPLE_CHAT.length));
      expect(screen.getAllByRole('listitem')).toHaveLength(EXAMPLE_CHAT.length);
      expect(screen.getByRole('button', {name: /Replay/})).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says only what the bot says: each bot line is in its own wording', () => {
    // The bot's replies and alert words, in pactora-backend-near apps/channels/src/channels.ts,
    // checked against that file when the backend is checked out beside this repo.
    const source = join(__dirname, '../../../pactora-backend-near/apps/channels/src/channels.ts');
    const bot = existsSync(source) ? readFileSync(source, 'utf8') : '';
    const words = [
      'Now type the 4-digit number shown next to the code in your browser.',
      'You will get your job updates here. /help for more.',
      'New bid on your listing',
      'A result was submitted on chain',
      'events on your jobs. The latest:',
      'The job settled on chain: payment released',
      'Work on offer (apply on the site):',
    ];
    for (const w of words) {
      expect(
        EXAMPLE_CHAT.some((l) => l.from === 'bot' && l.text.includes(w)),
        w,
      ).toBe(true);
      if (bot) expect(bot.includes(w), w).toBe(true);
    }
  });
});
