'use client';

import {useRouter} from 'next/navigation';
import {useRef, useState, type FormEvent} from 'react';
import {errorText, SignInGate, useNetwork} from '@/components/market/hooks';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, Select, TextArea, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState} from '@/components/ui/States';
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
import {applyTemplate, LISTING_TEMPLATES} from '@/lib/listing-templates';
import {
  amountDisplay,
  CATEGORIES,
  market,
  MODES,
  type Category,
  type HiringMode,
  type InteractionMode,
} from '@/lib/market';
import {useSession} from '@/lib/session';
import {StandingBanner} from '@/components/market/Standing';
import {NotReady} from '@/components/market/Readiness';
import {MoneyPanel, useMoney} from '@/components/money/MoneyPanel';
import {postBlocked, standingBlock} from '@/lib/hire';
import {useStanding} from '@/components/market/Readiness';
import {parseUnits} from '@/lib/near';

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

/** Seconds as whole minutes, or hours past two. */
function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 120 && m % 60 === 0 ? `${m / 60} hours` : `${m} minutes`;
}
export function NewListingView() {
  const session = useSession();
  const router = useRouter();
  const token = useNetwork();
  // Network facts for the hints (live audit, 2026-11-13: limits and defaults were not said).
  const net = token?.network;
  const windows = net?.windows ?? null;
  const feePct = net ? `${net.protocolFeeBps / 100}%` : '';
  const limitsLine =
    net?.minJobAmount && token
      ? ` Between ${amountDisplay(net.minJobAmount, token.decimals, token.symbol)}${
          net.maxJobAmount ? ` and ${amountDisplay(net.maxJobAmount, token.decimals, token.symbol)}` : ''
        } per worker.`
      : '';
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{message: string; uncertain: boolean} | null>(null);
  const key = useRef<KeyState | null>(null);
  const [template, setTemplate] = useState<string>('blank');

  // The purse the listing reserves against (the API's checkBudget): a listing it would refuse is not sent.
  const money = useMoney(token?.network ?? null, {
    account: session.status === 'in' ? session.account : null,
    chainAgentId: session.person?.chainAgentId ?? null,
  });
  const purse = money.record?.ok ? money.record.value.purse : null;
  const ceiling = parseUnits(draft.price, token?.decimals ?? 6);
  const workers = /^\d{1,2}$/.test(draft.maxWorkers.trim()) ? Number(draft.maxWorkers.trim()) : NaN;
  const standing = useStanding();
  const moneyBlock =
    standingBlock(standing, 'post work') ??
    (token && ceiling && !/^0+$/.test(ceiling)
      ? postBlocked(ceiling, workers, purse, {
          decimals: token.decimals,
          symbol: token.symbol,
          chainAgentId: session.person?.chainAgentId ?? null,
          testnet: token.network.testnet,
        })
      : null);

  /** A template fills the form (F31); "blank" empties it. Errors are cleared: the fields changed. */
  function pick(id: string) {
    setTemplate(id);
    setErrors({});
    setFailure(null);
    const t = LISTING_TEMPLATES.find((x) => x.id === id);
    setDraft(t ? applyTemplate(t) : EMPTY_DRAFT);
  }

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
        {/* No person record: the join step instead of a form that can only be refused (item 9). An
            unknown record (the API failed) shows nothing here: the banner under the header has the retry. */}
        {session.status === 'in' && !session.person ? (
          session.personError ? null : (
            <Card title="Join first" labelledBy="join-first">
              <div data-testid="join-first" className="space-y-3 text-sm">
                <p className="text-muted">
                  Posting a listing needs a person record on Pactora: it is who the bids go to, and whose
                  wallet funds the worker you choose. Joining takes one transaction and no API key.
                </p>
                <ButtonLink icon="user" href="/join" variant="primary">
                  Join as a person
                </ButtonLink>
              </div>
            </Card>
          )
        ) : (
          <>
            <StandingBanner />

            <fieldset className="rounded-xl border border-edge bg-surface/80 p-5 backdrop-blur-sm">
              <legend className="px-1 text-sm font-semibold tracking-tight">Start from a template</legend>
              <p className="mb-3 text-xs text-muted">
                Three worked examples to change as you like, or an empty form. The deadline is always yours to
                set.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {LISTING_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={template === t.id}
                    onClick={() => pick(t.id)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      template === t.id
                        ? 'border-accent bg-accent/10 text-text'
                        : 'border-edge text-muted hover:border-edge-strong hover:text-text'
                    }`}
                  >
                    <span className="block font-medium text-text">{t.label}</span>
                    <span className="mt-0.5 block text-xs">{t.blurb}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={template === 'blank'}
                  onClick={() => pick('blank')}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    template === 'blank'
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-edge text-muted hover:border-edge-strong hover:text-text'
                  }`}
                >
                  <span className="block font-medium text-text">Start from blank</span>
                  <span className="mt-0.5 block text-xs">An empty form.</span>
                </button>
              </div>
            </fieldset>

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
                      hint="Physical: someone goes somewhere. Expertise: knowledge work. Judgment: a decision on each item."
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
                      hint="Task: deliver a result. Conversation: talk it through. Capture: send photos of a place."
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
                      hint={`The ceiling. Workers bid at or under it; the ${feePct} fee comes out of what they receive.${limitsLine}`}
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
                      hint={`${LIMITS.workers.min}-${LIMITS.workers.max}. Your daily allowance (your purse’s 24-hour spending cap) is reserved for every slot.`}
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
                    hint="Bids: you read the bids and choose. Instant: the first eligible workers take the slots at the ceiling."
                  >
                    <Select
                      id="nl-hiringMode"
                      value={draft.hiringMode}
                      onChange={(e) => set('hiringMode', e.target.value as HiringMode)}
                    >
                      <option value="applications">Bids: I choose</option>
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
                      hint={`How long a chosen worker has to accept. Empty uses the network default${windows ? ` (${minutes(windows.accept)})` : ''}.`}
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
                      hint={`At most ${MAX_WORK_WINDOW_MINUTES} minutes: the testnet contract’s longest work window is 5 hours. For longer work, split it into tasks. Empty uses the network default${windows ? ` (${minutes(windows.work)}); you then have ${minutes(windows.review)} to review the delivery` : ''}.`}
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

              <MoneyPanel
                network={token?.network ?? null}
                money={money}
                account={session.account}
                chainAgentId={session.person?.chainAgentId ?? null}
                compact
                only={['purse', 'daily', 'near']}
                id="post-money"
              />
              <NotReady readiness={moneyBlock ?? {reason: null, fixes: []}} testId="post-money-blocked" />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  icon="plus"
                  type="submit"
                  loading={busy}
                  disabled={session.status !== 'in' || moneyBlock !== null}
                >
                  Post the listing
                </Button>
                <span className="text-xs text-muted">
                  Posting is free; money moves only when a worker is chosen and funded.
                </span>
              </div>
            </form>
          </>
        )}
      </SignInGate>
    </div>
  );
}
