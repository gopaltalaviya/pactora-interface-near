'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextArea, TextInput} from '@/components/ui/Field';
import {Notice, Skeleton} from '@/components/ui/States';
import {
  bytesDisplay,
  criteriaToChecks,
  DECISION_WORDS,
  EVIDENCE_LIMITS,
  evidence,
  PHASE_WORDS,
  sha256OfBlob,
  validateDraftText,
  validateMessage,
  validatePhoto,
  validateReview,
  type Draft,
  type DraftsPage,
  type EvidenceFile,
  type FilesPage,
  type MessagesPage,
  type ReviewCheck,
  type ReviewDecision,
} from '@/lib/evidence';
import {useSession} from '@/lib/session';
import {ReportButton} from './Report';

/**
 * A listing job's delivery, for its two parties (docs/26 F6–F8): the worker's
 * evidence photos, the draft rounds with the client's review of each, and
 * the job's chat. Everything here is off chain until the client accepts a
 * draft; then only that snapshot's sha256 goes on chain, which anyone can
 * compare with the snapshot shown here.
 */

export type Party = 'client' | 'worker';

export interface Delivery {
  drafts: DraftsPage | null;
  files: FilesPage | null;
  messages: MessagesPage | null;
  error: string | null;
  reload: () => void;
}

/** Reads the three, again whenever `attempt` changes (the page's live stream says when). */
export function useDelivery(jobId: string, party: Party | null, attempt: number): Delivery {
  const {authed} = useSession();
  const [drafts, setDrafts] = useState<DraftsPage | null>(null);
  const [files, setFiles] = useState<FilesPage | null>(null);
  const [messages, setMessages] = useState<MessagesPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState(0);
  const reload = useCallback(() => setOwn((n) => n + 1), []);

  useEffect(() => {
    if (!party) return;
    const controller = new AbortController();
    const {signal} = controller;
    Promise.all([
      authed((t) => evidence.drafts(t, jobId, signal)),
      // Photos answer 503 where storage is not configured; the rest still works.
      authed((t) => evidence.files(t, jobId, signal)).catch(() => null),
      authed((t) => evidence.messages(t, jobId, signal)),
    ])
      .then(([d, f, m]) => {
        setDrafts(d);
        setFiles(f);
        setMessages(m);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setError(errorText(err));
      });
    return () => controller.abort();
  }, [jobId, party, authed, attempt, own]);

  return {drafts, files, messages, error, reload};
}

export function DeliveryPanels({
  jobId,
  party,
  jobState,
  criteria,
  delivery,
}: {
  jobId: string;
  party: Party;
  jobState: string;
  criteria: string;
  delivery: Delivery;
}) {
  const {drafts, files, messages, error, reload} = delivery;
  if (error && !drafts) {
    return (
      <Notice>
        <span role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={reload}>
            Retry
          </button>
        </span>
      </Notice>
    );
  }
  if (!drafts) return <Skeleton className="h-40 w-full" />;
  const working = jobState === 'accepted';
  return (
    <>
      <DraftsCard
        jobId={jobId}
        party={party}
        drafts={drafts}
        criteria={criteria}
        working={working}
        jobState={jobState}
        onChange={reload}
      />
      <PhotosCard jobId={jobId} party={party} files={files} working={working} onChange={reload} />
      {messages && <ChatCard jobId={jobId} party={party} page={messages} onChange={reload} />}
    </>
  );
}

// ─── drafts and review ──────────────────────────────────────────────────────

function DraftsCard({
  jobId,
  party,
  drafts,
  criteria,
  working,
  jobState,
  onChange,
}: {
  jobId: string;
  party: Party;
  drafts: DraftsPage;
  criteria: string;
  working: boolean;
  jobState: string;
  onChange: () => void;
}) {
  const latest = drafts.drafts.at(-1) ?? null;
  const canPost = party === 'worker' && working && (drafts.phase === 'none' || drafts.phase === 'revise');
  const canReview = party === 'client' && working && drafts.phase === 'awaiting_review' && latest !== null;
  return (
    <Card
      title="Drafts and review"
      labelledBy="drafts"
      description={`${drafts.revisionsUsed} of ${EVIDENCE_LIMITS.revisions} revisions used`}
    >
      <div className="space-y-4">
        <p className="text-sm" data-testid="draft-phase">
          {jobState === 'refunded'
            ? 'The job was refunded, so the drafts are closed; what was posted stays here as the record.'
            : jobState === 'settled'
              ? 'The job settled: the accepted draft was delivered and paid.'
              : PHASE_WORDS[drafts.phase]}
        </p>
        {drafts.acceptedSnapshotHash && (
          <p className="break-all text-xs text-muted">
            Accepted snapshot sha256:{' '}
            <code className="tabular" data-testid="accepted-hash">
              {drafts.acceptedSnapshotHash}
            </code>
          </p>
        )}
        {drafts.drafts.length > 0 && (
          <ol aria-label="Draft rounds" className="space-y-3">
            {drafts.drafts.map((d) => (
              <DraftRound key={d.draftId} draft={d} />
            ))}
          </ol>
        )}
        {canPost && <DraftForm jobId={jobId} round={drafts.drafts.length + 1} onDone={onChange} />}
        {canReview && (
          <ReviewForm
            jobId={jobId}
            draft={latest}
            criteria={criteria}
            revisionsLeft={drafts.revisionsLeft}
            onDone={onChange}
          />
        )}
      </div>
    </Card>
  );
}

function DraftRound({draft}: {draft: Draft}) {
  const r = draft.review;
  return (
    <li className="space-y-2 rounded-lg border border-edge p-3" data-testid={`draft-${draft.round}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Round {draft.round}</span>
        {r ? (
          <Badge
            tone={r.decision === 'accept_draft' ? 'settled' : r.decision === 'revise' ? 'live' : 'broken'}
          >
            {DECISION_WORDS[r.decision]}
          </Badge>
        ) : (
          <Badge tone="neutral">Awaiting review</Badge>
        )}
      </div>
      {/* Written by the worker: shown as text, never as markup. */}
      <p className="whitespace-pre-wrap break-words text-sm">{draft.snapshot.text}</p>
      <p className="text-xs text-muted">
        {draft.snapshot.files.length} photo{draft.snapshot.files.length === 1 ? '' : 's'} ·{' '}
        {draft.snapshot.messages.length} message{draft.snapshot.messages.length === 1 ? '' : 's'} · posted{' '}
        {utc(draft.createdAt)}
      </p>
      <p className="break-all text-xs text-muted">
        Snapshot sha256: <code className="tabular">{draft.snapshotHash}</code>
      </p>
      {r && (
        <div className="space-y-1 border-t border-edge pt-2 text-sm">
          <p className="whitespace-pre-wrap break-words">{r.reason}</p>
          <ul aria-label={`Checks for round ${draft.round}`} className="space-y-0.5 text-xs">
            {r.checks.map((c, i) => (
              <li key={i}>
                <span aria-hidden>{c.met ? '✓' : '✗'}</span>
                <span className="sr-only">{c.met ? 'Met:' : 'Not met:'}</span> {c.criterion}
                {c.support && <span className="text-muted"> — {c.support}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function DraftForm({jobId, round, onDone}: {jobId: string; round: number; onDone: () => void}) {
  const {authed} = useSession();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post() {
    const p = validateDraftText(text);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      await authed((t) => evidence.postDraft(t, jobId, {text: text.trim()}));
      setText('');
      onDone();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-edge-strong p-4">
      <Field
        label={`Draft ${round}: what you did`}
        htmlFor="draft-text"
        error={problem}
        hintId="draft-text-hint"
        hint="The photos below and the conversation so far go into this draft's snapshot. Once posted it cannot be changed."
      >
        <TextArea
          id="draft-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="draft-text-hint"
          aria-invalid={Boolean(problem) || undefined}
        />
      </Field>
      <Button disabled={busy} loading={busy} onClick={() => void post()}>
        Post draft {round}
      </Button>
    </div>
  );
}

function ReviewForm({
  jobId,
  draft,
  criteria,
  revisionsLeft,
  onDone,
}: {
  jobId: string;
  draft: Draft;
  criteria: string;
  revisionsLeft: number;
  onDone: () => void;
}) {
  const {authed} = useSession();
  const [checks, setChecks] = useState<ReviewCheck[]>(() => {
    const list = criteriaToChecks(criteria);
    return (list.length > 0 ? list : ['The work meets the listing']).map((criterion) => ({
      criterion,
      met: false,
      support: '',
    }));
  });
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  // A revision spends one of a few; a dispute ends the drafts. Each is asked twice.
  const [confirming, setConfirming] = useState<'revise' | 'dispute_intent' | null>(null);

  const setCheck = (i: number, patch: Partial<ReviewCheck>) =>
    setChecks((cs) => cs.map((c, j) => (j === i ? {...c, ...patch} : c)));

  function decide(decision: ReviewDecision) {
    const p = validateReview(decision, reason, checks, revisionsLeft);
    setProblem(p);
    if (p) return;
    if (decision === 'accept_draft') void commit(decision);
    else setConfirming(decision);
  }

  async function commit(decision: ReviewDecision) {
    setBusy(decision);
    try {
      await authed((t) =>
        evidence.review(t, jobId, draft.draftId, {
          snapshotHash: draft.snapshotHash,
          decision,
          reason: reason.trim(),
          checks: checks.map((c) => ({...c, criterion: c.criterion.trim(), support: c.support.trim()})),
        }),
      );
      onDone();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  const allMet = checks.every((c) => c.met);
  const {min, max} = EVIDENCE_LIMITS.reviewReason;
  const hint =
    `${min}-${max} characters. ` +
    (confirming === 'dispute_intent'
      ? 'The worker reads it, and so does the arbiter if you dispute.'
      : confirming === 'revise'
        ? 'The worker reads it and posts the next draft.'
        : 'The worker reads it; its hash goes on chain with your approval.');
  return (
    <form
      className="space-y-4 rounded-lg border border-edge-strong p-4"
      aria-label={`Review of draft ${draft.round}`}
      onSubmit={(e) => e.preventDefault()}
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Check draft {draft.round} against each criterion</legend>
        {checks.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-md border border-edge p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={c.met}
                onChange={(e) => setCheck(i, {met: e.target.checked})}
              />
              <span>{c.criterion}</span>
            </label>
            <Field label={`What shows it (check ${i + 1})`} htmlFor={`check-support-${i}`} srOnlyLabel>
              <TextInput
                id={`check-support-${i}`}
                placeholder="Evidence (optional)"
                value={c.support}
                maxLength={EVIDENCE_LIMITS.support.max}
                onChange={(e) => setCheck(i, {support: e.target.value})}
              />
            </Field>
          </div>
        ))}
      </fieldset>
      <Field
        label="Your reason"
        htmlFor="review-reason"
        error={problem}
        hintId="review-reason-hint"
        hint={hint}
      >
        <TextArea
          id="review-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby="review-reason-hint"
          aria-invalid={Boolean(problem) || undefined}
        />
      </Field>
      {confirming === null ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy !== null || !allMet}
            loading={busy === 'accept_draft'}
            onClick={() => decide('accept_draft')}
          >
            Accept this draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null || revisionsLeft <= 0}
            onClick={() => decide('revise')}
          >
            Ask for a revision ({revisionsLeft} left)
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy !== null}
            onClick={() => decide('dispute_intent')}
          >
            I will dispute
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-edge-strong p-3" data-testid="review-confirm">
          <p className="text-sm">
            {confirming === 'revise'
              ? `This uses 1 of ${EVIDENCE_LIMITS.revisions} revisions (${revisionsLeft - 1} left after it). The worker reads your reason and posts the next draft.`
              : 'No more drafts are taken after this. Disputing on chain then needs your bond, which the arbiter returns only if it rules for you; your reason is read by both.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={confirming === 'revise' ? 'secondary' : 'danger'}
              disabled={busy !== null}
              loading={busy === confirming}
              onClick={() => void commit(confirming)}
            >
              {confirming === 'revise' ? 'Confirm revision' : 'Confirm dispute'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirming(null)}
            >
              Keep reviewing
            </Button>
          </div>
        </div>
      )}
      {!allMet && confirming === null && (
        <p className="text-xs text-muted">Accepting needs every criterion checked.</p>
      )}
    </form>
  );
}

// ─── photos ─────────────────────────────────────────────────────────────────

function PhotosCard({
  jobId,
  party,
  files,
  working,
  onChange,
}: {
  jobId: string;
  party: Party;
  files: FilesPage | null;
  working: boolean;
  onChange: () => void;
}) {
  const {authed} = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!files) {
    return (
      <Card title="Evidence photos" labelledBy="photos">
        <p className="text-sm text-muted" data-testid="photos-unavailable">
          Photo evidence is not available on this server right now.
        </p>
      </Card>
    );
  }

  const full = files.active >= files.limits.maxActive || files.total >= files.limits.maxTotal;

  async function upload(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const p = validatePhoto(file);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      await authed((t) => evidence.upload(t, jobId, file, file.name));
      onChange();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function withdraw(fileId: string) {
    setProblem(null);
    try {
      await authed((t) => evidence.withdraw(t, jobId, fileId));
      onChange();
    } catch (err) {
      setProblem(errorText(err));
    }
  }

  return (
    <Card
      title="Evidence photos"
      labelledBy="photos"
      description={`${files.active} of ${files.limits.maxActive} in use · ${files.total} of ${files.limits.maxTotal} uploaded`}
    >
      <div className="space-y-4">
        {files.files.length === 0 ? (
          <p className="text-sm text-muted">No photos yet.</p>
        ) : (
          <ul aria-label="Photos" className="grid gap-3 sm:grid-cols-2">
            {files.files.map((f) => (
              <PhotoItem
                key={f.fileId}
                file={f}
                canWithdraw={party === 'worker' && working && f.withdrawnAt === null}
                onWithdraw={() => void withdraw(f.fileId)}
              />
            ))}
          </ul>
        )}
        {party === 'worker' && working && (
          <Field
            label="Add a photo"
            htmlFor="photo-input"
            error={problem}
            hintId="photo-hint"
            hint={`PNG, JPEG or WebP, at most ${bytesDisplay(files.limits.maxBytes)}. Location and camera details are removed before it is stored.`}
          >
            <input
              ref={input}
              id="photo-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || full}
              aria-describedby="photo-hint"
              className="file-input block text-sm"
              onChange={(e) => void upload(e.target.files)}
            />
          </Field>
        )}
        {party !== 'worker' && problem && (
          <p role="alert" className="text-xs text-broken">
            {problem}
          </p>
        )}
      </div>
    </Card>
  );
}

function PhotoItem({
  file,
  canWithdraw,
  onWithdraw,
}: {
  file: EvidenceFile;
  canWithdraw: boolean;
  onWithdraw: () => void;
}) {
  const {authed} = useSession();
  const [src, setSrc] = useState<string | null>(null);
  const [verified, setVerified] = useState<'yes' | 'no' | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    authed((t) => evidence.photo(t, file.fileId, controller.signal))
      .then(async (blob) => {
        setVerified((await sha256OfBlob(blob)) === file.sha256 ? 'yes' : 'no');
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [authed, file.fileId, file.sha256]);

  const withdrawn = file.withdrawnAt !== null;
  return (
    <li className={`space-y-2 rounded-lg border border-edge p-2 ${withdrawn ? 'opacity-60' : ''}`}>
      {src ? (
        // A blob URL of bytes fetched with the session: next/image cannot load it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Evidence ${file.fileId.slice(0, 8)}`}
          className="h-40 w-full rounded object-contain"
        />
      ) : failed ? (
        <p className="text-xs text-broken">Could not load this photo.</p>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {bytesDisplay(file.size)} · {withdrawn ? 'withdrawn' : 'in use'}
          {file.purpose === 'dispute' && ' · the client’s dispute photo'}
          {verified === 'yes' && <span data-testid="photo-verified"> · sha256 matches</span>}
          {verified === 'no' && (
            <span role="alert" className="text-broken">
              {' '}
              · sha256 does not match
            </span>
          )}
        </span>
        {canWithdraw && !confirm && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Withdraw
          </Button>
        )}
        {canWithdraw && confirm && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Leaves the evidence; it stays listed as withdrawn.</span>
            <Button size="sm" variant="danger" onClick={onWithdraw}>
              Confirm withdrawal
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}

// ─── chat ───────────────────────────────────────────────────────────────────

function ChatCard({
  jobId,
  party,
  page,
  onChange,
}: {
  jobId: string;
  party: Party;
  page: MessagesPage;
  onChange: () => void;
}) {
  const {authed} = useSession();
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per message being written, so a retry after a dropped answer is the same message.
  const key = useRef<string>(crypto.randomUUID());

  async function send() {
    const p = validateMessage(body);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      await authed((t) => evidence.send(t, jobId, body, key.current));
      key.current = crypto.randomUUID();
      setBody('');
      onChange();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Conversation" labelledBy="chat" description={`${page.count} of ${page.limit} messages`}>
      <div className="space-y-4">
        {page.messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet.</p>
        ) : (
          <ol aria-label="Messages" className="max-h-96 space-y-2 overflow-auto">
            {page.messages.map((m) => (
              <li
                key={m.messageId}
                className={`rounded-lg border border-edge p-2 text-sm ${m.from === party ? 'ml-8' : 'mr-8'}`}
              >
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {m.from === party ? 'You' : `The ${m.from}`} · {utc(m.at)}
                  </span>
                  {m.from !== party && (
                    <ReportButton targetType="message" targetId={m.messageId} what="this message" />
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
        {page.writable ? (
          <div className="space-y-2">
            <Field
              label="Your message"
              htmlFor="chat-body"
              error={problem}
              hintId="chat-hint"
              hint="Both of you and, in a dispute, the arbiter can read this. Never paste a key or a secret."
            >
              <TextArea
                id="chat-body"
                rows={2}
                value={body}
                maxLength={EVIDENCE_LIMITS.message.max}
                onChange={(e) => setBody(e.target.value)}
                aria-describedby="chat-hint"
                aria-invalid={Boolean(problem) || undefined}
              />
            </Field>
            <Button size="sm" disabled={busy} loading={busy} onClick={() => void send()}>
              Send
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted" data-testid="chat-closed">
            The conversation is closed: it is open while the job is accepted or submitted.
          </p>
        )}
      </div>
    </Card>
  );
}
