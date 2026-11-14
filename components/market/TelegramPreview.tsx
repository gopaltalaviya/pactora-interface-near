'use client';

/**
 * What the Telegram bot looks like, before anyone links a chat (owner's
 * request, 2026-11-13: "show how it looks"). An example chat with made-up
 * data, labelled as such; every bot line is the bot's own wording
 * (pactora-backend-near apps/channels/src/channels.ts), so the preview cannot
 * promise more than the bot does: job updates and two commands, with anything
 * that signs or spends done on the site.
 *
 * The page renders the whole chat; once the script runs, it replays one
 * message at a time when the chat comes into view. With reduced motion, or
 * without IntersectionObserver, it stays whole.
 */

import {useEffect, useRef, useState} from 'react';
import {Icon} from '@/components/ui/Icon';
import {TELEGRAM_BOT} from '@/lib/site';

type Line = {from: 'you' | 'bot'; text: string; link?: string; alert?: boolean};

/** The example chat. The account name and links are made up. */
export const EXAMPLE_CHAT: Line[] = [
  {from: 'you', text: '/link K7Q2M9XP'},
  {from: 'bot', text: 'Now type the 4-digit number shown next to the code in your browser.'},
  {from: 'you', text: '4821'},
  {from: 'bot', text: 'Linked to Ada (example). You will get your job updates here. /help for more.'},
  {from: 'bot', text: 'New bid on your listing:', link: '/jobs/listing/…', alert: true},
  {from: 'bot', text: 'A result was submitted on chain:', link: '/jobs/…', alert: true},
  {from: 'you', text: '/status'},
  {
    from: 'bot',
    text: '3 events on your jobs. The latest:\n• The job settled on chain: payment released:',
    link: '/jobs/…',
  },
  {from: 'you', text: '/jobs'},
  {
    from: 'bot',
    text: 'Work on offer (apply on the site):\n• Summarise this week’s NEAR governance proposals:',
    link: '/jobs/listing/…',
  },
];

const STEP_MS = 650;

export function TelegramPreview() {
  const box = useRef<HTMLDivElement>(null);
  // The whole chat from the first render (no script, a crawler, a screenshot);
  // it replays one message at a time only once the script runs and it is in view.
  const [shown, setShown] = useState(EXAMPLE_CHAT.length);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = box.current;
    const still =
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!el || still) {
      setShown(EXAMPLE_CHAT.length);
      return;
    }
    setShown(0);
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || timer) return;
        timer = setInterval(() => {
          setShown((n) => {
            if (n + 1 >= EXAMPLE_CHAT.length && timer) clearInterval(timer);
            return Math.min(n + 1, EXAMPLE_CHAT.length);
          });
        }, STEP_MS);
      },
      {threshold: 0.3},
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [run]);

  const done = shown >= EXAMPLE_CHAT.length;
  return (
    <figure className="not-prose mx-auto max-w-md space-y-3" data-testid="telegram-preview">
      <div ref={box} className="overflow-hidden rounded-2xl border border-edge-strong bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-edge bg-raised px-4 py-3">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent"
          >
            <Icon name="send" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">Pactora</span>
            <span className="block text-xs text-muted">@{TELEGRAM_BOT} · bot</span>
          </span>
          <span className="ml-auto rounded-full border border-edge px-2 py-0.5 text-[11px] text-muted">
            Example chat
          </span>
        </div>
        <ol
          aria-label="An example chat with the Pactora bot"
          className="m-0 flex min-h-[26rem] list-none flex-col justify-end gap-2 bg-ink/60 p-4 text-sm"
        >
          {EXAMPLE_CHAT.slice(0, shown).map((m, i) => (
            <li
              key={i}
              className={`m-0 max-w-[85%] list-none whitespace-pre-line rounded-2xl px-3 py-2 leading-relaxed ${
                m.from === 'you'
                  ? 'self-end rounded-br-sm bg-accent/90 text-ink'
                  : 'self-start rounded-bl-sm border border-edge bg-raised text-text'
              }`}
            >
              <span className="sr-only">{m.from === 'you' ? 'You: ' : 'Bot: '}</span>
              {m.alert && (
                <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-refused">
                  <Icon name="bell" className="size-3" /> Alert, sent by itself
                </span>
              )}
              {m.text}
              {m.link && <span className="block truncate text-accent underline">pactora…{m.link}</span>}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Made-up data; the bot’s own words. It sends job updates; you sign on the site.</span>
        {done && (
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <Icon name="refresh" className="size-3.5" /> Replay
          </button>
        )}
      </figcaption>
    </figure>
  );
}
