'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {Notice} from '@/components/ui/States';
import {kyc, STANDING_WORDS, type Standing} from '@/lib/kyc';
import {useSession} from '@/lib/session';

/**
 * A person on hold or blocked learns it before a form, not from a refusal
 * after it (live audit 2026-11-09, M13): one line from GET /v1/kyc on /me,
 * /jobs/new and the bid card. Nothing is shown while standing is clear, or
 * for an account with no person record (the API answers 403 for those, so
 * they are not asked).
 */
export function StandingBanner() {
  const {status, person, authed} = useSession();
  const [standing, setStanding] = useState<Standing | null>(null);

  useEffect(() => {
    if (status !== 'in' || !person) {
      setStanding(null);
      return;
    }
    const controller = new AbortController();
    authed((t) => kyc.state(t, controller.signal))
      .then((s) => setStanding(s.standing))
      .catch(() => {
        if (!controller.signal.aborted) setStanding(null);
      });
    return () => controller.abort();
  }, [status, person, authed]);

  if (!standing || standing === 'clear') return null;
  return (
    <Notice>
      <p data-testid="standing-banner">
        <strong>Your account is {standing === 'hold' ? 'on hold' : 'blocked'}.</strong>{' '}
        {STANDING_WORDS[standing]}{' '}
        {standing === 'hold' ? 'A compliance reviewer decides; you will be told the outcome. ' : ''}
        <Link href="/me#settings" className="underline">
          Your identity check
        </Link>
        .
      </p>
    </Notice>
  );
}
