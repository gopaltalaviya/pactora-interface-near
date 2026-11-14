'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {bearer, request} from '@/lib/api';
import {useSession} from '@/lib/session';

/**
 * Job updates on Telegram or by email (docs/26 F11, F12). Linking Telegram
 * takes a code AND a number: the code goes to the bot, then the number,
 * which only this page shows. The bot never signs or spends: it sends links
 * back to this site for anything that does.
 */

interface ChannelsState {
  telegram: {bot: string} | null;
  email: boolean;
  links: {channel: 'telegram' | 'email'; address: string; since: string}[];
}

const api = {
  state: (t: string) =>
    request<ChannelsState>('/v1/me/channels', {headers: bearer(t)}, 'could not load your channels'),
  telegramCode: (t: string) =>
    request<{code: string; number: string; expiresAt: string; bot: string}>(
      '/v1/me/channels/telegram/code',
      {method: 'POST', headers: bearer(t)},
      'could not get a code',
    ),
  email: (t: string, address: string) =>
    request<{address: string}>(
      '/v1/me/channels/email',
      {
        method: 'POST',
        headers: {'content-type': 'application/json', ...bearer(t)},
        body: JSON.stringify({address}),
      },
      'could not send the code',
    ),
  verify: (t: string, code: string) =>
    request<{linked: true}>(
      '/v1/me/channels/email/verify',
      {
        method: 'POST',
        headers: {'content-type': 'application/json', ...bearer(t)},
        body: JSON.stringify({code}),
      },
      'could not check the code',
    ),
  unlink: (t: string, channel: string) =>
    request<{unlinked: boolean}>(
      `/v1/me/channels/${channel}`,
      {method: 'DELETE', headers: bearer(t)},
      'could not unlink',
    ),
};

export function ChannelsCard() {
  const {authed} = useSession();
  const [s, setS] = useState<ChannelsState | null>(null);
  const [tg, setTg] = useState<{code: string; number: string; bot: string} | null>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    authed((t) => api.state(t))
      .then(setS)
      .catch(() => setS(null));
  }, [authed, attempt]);

  if (!s || (!s.telegram && !s.email)) return null;
  const linked = (c: string) => s.links.find((l) => l.channel === c);
  const run = async (fn: () => Promise<void>) => {
    setProblem(null);
    try {
      await fn();
    } catch (err) {
      setProblem(errorText(err));
    }
  };

  return (
    <Card
      title="Notifications elsewhere"
      labelledBy="channels"
      description="Job updates on Telegram or by email. The bot sends updates and links; anything you sign happens here."
    >
      <div className="space-y-4 text-sm">
        {s.telegram && (
          <div className="space-y-2" data-testid="channel-telegram">
            <h3 className="font-medium">Telegram</h3>
            {linked('telegram') ? (
              <p>
                Linked ({linked('telegram')!.address}).{' '}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(async () => {
                      await authed((t) => api.unlink(t, 'telegram'));
                      setAttempt((n) => n + 1);
                    })
                  }
                >
                  Unlink
                </Button>
              </p>
            ) : tg ? (
              <p data-testid="telegram-code">
                Send <code className="tabular">/link {tg.code}</code> to @{tg.bot}, then type{' '}
                <strong className="tabular">{tg.number}</strong> when it asks. The code works for 10 minutes.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  icon="send"
                  onClick={() => void run(async () => setTg(await authed((t) => api.telegramCode(t))))}
                >
                  Link Telegram
                </Button>
                <Link href="/docs/people#channels" className="text-accent hover:underline">
                  See an example chat
                </Link>
              </div>
            )}
          </div>
        )}
        {s.email && (
          <div className="space-y-2" data-testid="channel-email">
            <h3 className="font-medium">Email</h3>
            {linked('email') ? (
              <p>
                Linked ({linked('email')!.address}).{' '}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(async () => {
                      await authed((t) => api.unlink(t, 'email'));
                      setAttempt((n) => n + 1);
                    })
                  }
                >
                  Unlink
                </Button>
              </p>
            ) : sentTo ? (
              <form
                className="flex flex-wrap items-end gap-2"
                aria-label="Confirm your email"
                onSubmit={(e) => e.preventDefault()}
              >
                <Field label={`The 6-digit code sent to ${sentTo}`} htmlFor="email-code">
                  <TextInput
                    id="email-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Button
                  size="sm"
                  onClick={() =>
                    void run(async () => {
                      await authed((t) => api.verify(t, code.trim()));
                      setSentTo(null);
                      setAttempt((n) => n + 1);
                    })
                  }
                >
                  Confirm
                </Button>
              </form>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                aria-label="Add an email"
                onSubmit={(e) => e.preventDefault()}
              >
                <Field label="Email address" htmlFor="email-address">
                  <TextInput
                    id="email-address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button
                  size="sm"
                  onClick={() =>
                    void run(async () => setSentTo((await authed((t) => api.email(t, email.trim()))).address))
                  }
                >
                  Send a code
                </Button>
              </form>
            )}
          </div>
        )}
        {problem && (
          <p role="alert" className="text-xs text-broken">
            {problem}
          </p>
        )}
      </div>
    </Card>
  );
}
