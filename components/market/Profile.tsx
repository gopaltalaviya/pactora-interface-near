'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, Select, TextArea, TextInput} from '@/components/ui/Field';
import {Skeleton} from '@/components/ui/States';
import {
  isRevealed,
  PROFILE_LIMITS,
  profiles,
  starsOf,
  validatePartyReview,
  validateProfile,
  type PartyReviews,
  type ProfileForm,
} from '@/lib/profiles';
import {useSession} from '@/lib/session';

/** Your public profile: nothing is listed until you publish, and your account shows only if you choose. */
export function ProfileEditor() {
  const {authed} = useSession();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => profiles.mine(t, controller.signal))
      .then((m) => {
        setForm({
          displayName: m.displayName,
          headline: m.headline,
          bio: m.bio,
          showAccount: m.showAccount,
          published: m.published,
        });
        setProfileId(m.profileId ?? null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setProblem(errorText(err));
      });
    return () => controller.abort();
  }, [authed]);

  if (!form) {
    return problem ? null : <Skeleton className="h-40 w-full" />;
  }
  const set = (patch: Partial<ProfileForm>) => setForm((f) => (f ? {...f, ...patch} : f));

  async function save() {
    if (!form) return;
    const p = validateProfile(form);
    setProblem(p);
    setSaved(null);
    if (p) return;
    setBusy(true);
    try {
      const r = await authed((t) => profiles.save(t, form));
      setProfileId(r.profileId);
      setSaved(r.published ? 'Saved and published.' : 'Saved. It is not public until you publish it.');
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Public profile"
      labelledBy="profile"
      description="What the directory shows. Nothing is public until you publish it."
    >
      <form className="space-y-4" aria-label="Public profile" onSubmit={(e) => e.preventDefault()}>
        <Field label="Display name" htmlFor="pf-name" error={problem}>
          <TextInput
            id="pf-name"
            value={form.displayName}
            maxLength={PROFILE_LIMITS.displayName.max}
            onChange={(e) => set({displayName: e.target.value})}
          />
        </Field>
        <Field label="Headline" htmlFor="pf-headline" hint="One line: what you do. At most 140 characters.">
          <TextInput
            id="pf-headline"
            value={form.headline}
            maxLength={PROFILE_LIMITS.headline.max}
            onChange={(e) => set({headline: e.target.value})}
          />
        </Field>
        <Field label="About you" htmlFor="pf-bio" hint="At most 2000 characters.">
          <TextArea
            id="pf-bio"
            rows={4}
            value={form.bio}
            maxLength={PROFILE_LIMITS.bio.max}
            onChange={(e) => set({bio: e.target.value})}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.showAccount}
            onChange={(e) => set({showAccount: e.target.checked})}
          />
          <span>Show my NEAR account on the profile (otherwise only the display name is shown)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.published}
            onChange={(e) => set({published: e.target.checked})}
          />
          <span>Publish: list me in the directory</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} loading={busy} onClick={() => void save()}>
            Save profile
          </Button>
          {saved && (
            <p role="status" className="text-sm" data-testid="profile-saved">
              {saved}{' '}
              {form.published && profileId && (
                <Link href={`/people/${profileId}`} className="underline">
                  View it
                </Link>
              )}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

/**
 * After a job settles on chain, each party reviews the other once, within
 * 14 days. Blind: you see what they wrote only once you have written yours,
 * or the 14 days are over.
 */
export function PartyReviewCard({jobId, attempt}: {jobId: string; attempt: number}) {
  const {authed} = useSession();
  const [data, setData] = useState<PartyReviews | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => profiles.partyReviews(t, jobId, controller.signal))
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      });
    return () => controller.abort();
  }, [authed, jobId, attempt, own]);

  if (!data || !data.window.settledOnChain) return null;
  const other = data.role === 'client' ? 'worker' : 'client';

  async function send() {
    const p = validatePartyReview(rating, body);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      await authed((t) => profiles.review(t, jobId, {rating, body: body.trim()}));
      setOwn((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={`Review the ${other}`}
      labelledBy="party-review"
      description={
        data.window.closesAt ? `Open until ${new Date(data.window.closesAt).toUTCString()}.` : undefined
      }
    >
      <div className="space-y-4 text-sm">
        {data.mine ? (
          <p data-testid="my-review">
            You wrote:{' '}
            <span aria-hidden className="text-accent">
              {starsOf(data.mine.rating)}
            </span>{' '}
            <span className="sr-only">{data.mine.rating} out of 5. </span>
            {data.mine.body}
          </p>
        ) : data.window.open ? (
          <form className="space-y-3" aria-label={`Review the ${other}`} onSubmit={(e) => e.preventDefault()}>
            <Field label="Rating" htmlFor="pr-rating" error={problem}>
              <Select id="pr-rating" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value={0}>Choose…</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} — {['', 'Poor', 'Below what was asked', 'As asked', 'Good', 'Excellent'][n]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="How it went"
              htmlFor="pr-body"
              hint="10-2000 characters. Shown on their profile once you have both reviewed."
            >
              <TextArea
                id="pr-body"
                rows={3}
                value={body}
                maxLength={PROFILE_LIMITS.review.max}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Button size="sm" disabled={busy} loading={busy} onClick={() => void send()}>
              Send review
            </Button>
          </form>
        ) : (
          <p className="text-muted">The review window has closed.</p>
        )}
        <p data-testid="their-review">
          {data.theirs === null
            ? `The ${other} has not reviewed you yet.`
            : isRevealed(data.theirs)
              ? `The ${other} wrote: ${starsOf(data.theirs.rating)} ${data.theirs.body}`
              : `The ${other} has reviewed you. You will see it once you have written yours.`}
        </p>
      </div>
    </Card>
  );
}
