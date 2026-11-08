'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useRef, useState, type FormEvent} from 'react';
import {errorText, SignInGate, useNetwork} from '@/components/market/hooks';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, Select, TextArea, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice} from '@/components/ui/States';
import {
  classifyFailure,
  EMPTY_DRAFT,
  keyForSend,
  LIMITS,
  MAX_WORK_WINDOW_MINUTES,
  newKeyState,
  validateListing,
  type DraftErrors,
  type KeyState,
  type ListingDraft,
} from '@/lib/listing-form';
import {CATEGORIES, market, MODES, type Category, type HiringMode, type InteractionMode} from '@/lib/market';
import {useSession} from '@/lib/session';

/**
 * Post a listing. The form checks what the API checks, beside each field; the
 * API checks again. One Idempotency-Key belongs to this draft (see
 * lib/listing-form.ts), so pressing the button twice, or again after a dropped
 * connection, cannot post two listings.
 */

const freshKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function NewListingView() {
  const session = useSession();
  const router = useRouter();
  const token = useNetwork();
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{message: string; uncertain: boolean} | null>(null);
  const key = useRef<KeyState | null>(null);

  const set = <K extends keyof ListingDraft>(field: K, value: ListingDraft[K]) => {
    setDraft((d) => ({...d, [field]: value}));
    if (errors[field]) setErrors((e) => ({...e, [field]: undefined}));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const {errors: found, body} = validateListing(draft, {
      decimals: token?.decimals ?? 6,
      now: Date.now(),
      minJobAmount: token?.minJobAmount,
      maxJobAmount: token?.maxJobAmount,
      symbol: token?.symbol ?? '',
    });
    setErrors(found);
    setFailure(null);
    if (!body) {
      // Take the person to the first problem.
      const first = Object.keys(found)[0];
      if (first) document.getElementById(`nl-${first}`)?.focus();
      return;
    }
    key.current ??= newKeyState(freshKey);
    key.current = keyForSend(key.current, JSON.stringify(body), freshKey);
    const sentKey = key.current.key;
    setBusy(true);
    try {
      const listing = await session.authed((t) => market.createListing(t, body, sentKey));
      router.push(`/jobs/listing/${encodeURIComponent(listing.listingId)}`);
    } catch (err) {
      const outcome = classifyFailure(err);
      if (key.current) key.current = {...key.current, outcome};
      setFailure({message: errorText(err), uncertain: outcome === 'uncertain'});
      setBusy(false);
    }
  }

  /** The id of a field's hint or error line, when it has one: what aria-describedby may point at. */
  const cap = (field: keyof ListingDraft, hasHint = true) =>
    errors[field] || hasHint ? `nl-${field}-hint` : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={{href: '/jobs', label: 'Jobs'}}
        eyebrow="Jobs"
        title="Post a listing"
        description="Offer work to many people at once. A listing holds no money: each worker you pick becomes an ordinary escrow job at the price they bid."
      />

      <SignInGate what="post a listing">
        {session.status === 'in' && !session.person && (
          <Notice>
            Posting needs a person record on Pactora.{' '}
            <Link href="/join" className="underline">
              Join as a person
            </Link>{' '}
            first.
          </Notice>
        )}

        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
          <Card title="The work" labelledBy="work">
            <div className="space-y-4">
              <Field
                label="Title"
                htmlFor="nl-title"
                error={errors.title}
                hintId={cap('title')}
                hint={`${LIMITS.title.min}-${LIMITS.title.max} characters.`}
              >
                <TextInput
                  id="nl-title"
                  value={draft.title}
                  invalid={Boolean(errors.title)}
                  onChange={(e) => set('title', e.target.value)}
                  aria-describedby={cap('title')}
                />
              </Field>
              <Field
                label="Description"
                htmlFor="nl-description"
                error={errors.description}
                hintId={cap('description')}
                hint="What you need, where, and anything a worker should know."
              >
                <TextArea
                  id="nl-description"
                  rows={4}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  aria-describedby={cap('description')}
                  aria-invalid={Boolean(errors.description) || undefined}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Category"
                  htmlFor="nl-category"
                  error={errors.category}
                  hintId={cap('category', false)}
                >
                  <Select
                    id="nl-category"
                    value={draft.category}
                    onChange={(e) => set('category', e.target.value as Category | '')}
                    aria-describedby={cap('category', false)}
                    aria-invalid={Boolean(errors.category) || undefined}
                  >
                    <option value="">Choose…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="How it is done"
                  htmlFor="nl-interactionMode"
                  error={errors.interactionMode}
                  hintId={cap('interactionMode', false)}
                >
                  <Select
                    id="nl-interactionMode"
                    value={draft.interactionMode}
                    onChange={(e) => set('interactionMode', e.target.value as InteractionMode | '')}
                    aria-describedby={cap('interactionMode', false)}
                    aria-invalid={Boolean(errors.interactionMode) || undefined}
                  >
                    <option value="">Choose…</option>
                    {MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Skills (optional)"
                htmlFor="nl-skills"
                error={errors.skills}
                hintId={cap('skills')}
                hint={`Separate with commas. Up to ${LIMITS.skills.max}; each ${LIMITS.skill.min}-${LIMITS.skill.max} characters.`}
              >
                <TextInput
                  id="nl-skills"
                  value={draft.skills}
                  invalid={Boolean(errors.skills)}
                  onChange={(e) => set('skills', e.target.value)}
                  aria-describedby={cap('skills')}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Location (optional)"
                htmlFor="nl-location"
                error={errors.location}
                hintId={cap('location')}
                hint="Leave empty if the work can be done from anywhere."
              >
                <TextInput
                  id="nl-location"
                  value={draft.location}
                  invalid={Boolean(errors.location)}
                  onChange={(e) => set('location', e.target.value)}
                  aria-describedby={cap('location')}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Acceptance criteria"
                htmlFor="nl-criteria"
                error={errors.criteria}
                hintId={cap('criteria')}
                hint="How you will judge the result. Be specific: it is what a dispute is decided on."
              >
                <TextArea
                  id="nl-criteria"
                  rows={3}
                  value={draft.criteria}
                  onChange={(e) => set('criteria', e.target.value)}
                  aria-describedby={cap('criteria')}
                  aria-invalid={Boolean(errors.criteria) || undefined}
                />
              </Field>
            </div>
          </Card>

          <Card title="Price, people and time" labelledBy="terms">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Most you pay one worker${token?.symbol ? ` (${token.symbol})` : ''}`}
                  htmlFor="nl-price"
                  error={errors.price}
                  hintId={cap('price')}
                  hint="The ceiling. Workers bid at or under it; the fee comes out of what they receive."
                >
                  <TextInput
                    id="nl-price"
                    inputMode="decimal"
                    value={draft.price}
                    invalid={Boolean(errors.price)}
                    onChange={(e) => set('price', e.target.value)}
                    aria-describedby={cap('price')}
                    autoComplete="off"
                    mono
                  />
                </Field>
                <Field
                  label="Workers needed"
                  htmlFor="nl-maxWorkers"
                  error={errors.maxWorkers}
                  hintId={cap('maxWorkers')}
                  hint={`${LIMITS.workers.min}-${LIMITS.workers.max}. Your daily allowance is reserved for every slot.`}
                >
                  <TextInput
                    id="nl-maxWorkers"
                    inputMode="numeric"
                    value={draft.maxWorkers}
                    invalid={Boolean(errors.maxWorkers)}
                    onChange={(e) => set('maxWorkers', e.target.value)}
                    aria-describedby={cap('maxWorkers')}
                    mono
                  />
                </Field>
              </div>
              <Field
                label="Hiring"
                htmlFor="nl-hiringMode"
                hint="Applications: you read bids and choose. Instant: the first eligible workers take the slots at the ceiling."
              >
                <Select
                  id="nl-hiringMode"
                  value={draft.hiringMode}
                  onChange={(e) => set('hiringMode', e.target.value as HiringMode)}
                >
                  <option value="applications">Applications: I choose</option>
                  <option value="instant">Instant: first come, first served</option>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Estimated effort (minutes)"
                  htmlFor="nl-estimatedMinutes"
                  error={errors.estimatedMinutes}
                  hintId={cap('estimatedMinutes')}
                  hint="Per worker, so people can judge the price."
                >
                  <TextInput
                    id="nl-estimatedMinutes"
                    inputMode="numeric"
                    value={draft.estimatedMinutes}
                    invalid={Boolean(errors.estimatedMinutes)}
                    onChange={(e) => set('estimatedMinutes', e.target.value)}
                    aria-describedby={cap('estimatedMinutes')}
                    mono
                  />
                </Field>
                <Field
                  label="Listing deadline"
                  htmlFor="nl-deadline"
                  error={errors.deadline}
                  hintId={cap('deadline')}
                  hint="Your time zone. After this the listing stops taking bids."
                >
                  <TextInput
                    id="nl-deadline"
                    type="datetime-local"
                    value={draft.deadline}
                    invalid={Boolean(errors.deadline)}
                    onChange={(e) => set('deadline', e.target.value)}
                    aria-describedby={cap('deadline')}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Time to accept (minutes, optional)"
                  htmlFor="nl-acceptMinutes"
                  error={errors.acceptMinutes}
                  hintId={cap('acceptMinutes')}
                  hint="How long a chosen worker has to accept. Empty uses the network default."
                >
                  <TextInput
                    id="nl-acceptMinutes"
                    inputMode="numeric"
                    value={draft.acceptMinutes}
                    invalid={Boolean(errors.acceptMinutes)}
                    onChange={(e) => set('acceptMinutes', e.target.value)}
                    aria-describedby={cap('acceptMinutes')}
                    mono
                  />
                </Field>
                <Field
                  label="Time to do the work (minutes, optional)"
                  htmlFor="nl-workMinutes"
                  error={errors.workMinutes}
                  hintId={cap('workMinutes')}
                  hint={`At most ${MAX_WORK_WINDOW_MINUTES} minutes: the testnet contract’s longest work window is 5 hours. For longer work, split it into tasks. Empty uses the network default.`}
                >
                  <TextInput
                    id="nl-workMinutes"
                    inputMode="numeric"
                    value={draft.workMinutes}
                    invalid={Boolean(errors.workMinutes)}
                    onChange={(e) => set('workMinutes', e.target.value)}
                    aria-describedby={cap('workMinutes')}
                    mono
                  />
                </Field>
              </div>
            </div>
          </Card>

          {failure && (
            <ErrorState title="The listing was not posted">
              {failure.message}
              {failure.uncertain && (
                <span className="mt-1 block">
                  Pactora may not have received it, or may have posted it before the connection dropped.
                  Pressing the button again is safe: the same draft is never posted twice.
                </span>
              )}
            </ErrorState>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={session.status !== 'in'}>
              Post the listing
            </Button>
            <span className="text-xs text-muted">
              Posting is free; money moves only when a worker is chosen and funded.
            </span>
          </div>
        </form>
      </SignInGate>
    </div>
  );
}
