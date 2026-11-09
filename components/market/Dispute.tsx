'use client';

import {useEffect, useRef, useState} from 'react';
import {errorText} from '@/components/market/hooks';
import {utc} from '@/components/market/ListingCard';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextArea} from '@/components/ui/Field';
import {Skeleton} from '@/components/ui/States';
import {dispute, DISPUTE_LIMITS, validateNote, type DisputeEvidence} from '@/lib/dispute';
import {bytesDisplay, evidence, sha256OfBlob, validatePhoto, type EvidenceFile} from '@/lib/evidence';
import type {JudgeAttestation} from '@/lib/market';
import {useSession} from '@/lib/session';

/**
 * The client's dispute evidence on a job (2026-11-09 §8): notes and photos
 * the client adds while the job is submitted or disputed; both parties read
 * them, and the arbiter's desk shows them in its evidence bundle. Nothing
 * here is on chain: the dispute reason's hash is, and stays.
 */
export function DisputeEvidenceCard({
  jobId,
  party,
  jobState,
  attempt,
}: {
  jobId: string;
  party: 'client' | 'worker';
  jobState: string;
  attempt: number;
}) {
  const {authed} = useSession();
  const [data, setData] = useState<DisputeEvidence | null>(null);
  const [missing, setMissing] = useState(false);
  const [own, setOwn] = useState(0);
  const reload = () => setOwn((n) => n + 1);

  useEffect(() => {
    const controller = new AbortController();
    authed((t) => dispute.get(t, jobId, controller.signal))
      .then((d) => {
        setData(d);
        setMissing(false);
      })
      .catch(() => {
        // 404: never disputed and not submitted — nothing to show. Also an older API without the route.
        if (!controller.signal.aborted) setMissing(true);
      });
    return () => controller.abort();
  }, [authed, jobId, attempt, own]);

  if (missing) return null;
  if (!data) return <Skeleton className="h-24 w-full" />;
  const nothing = data.notes.length === 0 && data.files.length === 0;
  if (nothing && !data.canAttach) return null;

  return (
    <Card
      title="Dispute evidence"
      labelledBy="dispute-evidence"
      description={
        party === 'client'
          ? 'What you add here is read by the worker and, in a dispute, by the arbiter. The dispute reason itself is what the chain holds a hash of.'
          : 'Added by the client. The arbiter reads it with the rest of the evidence.'
      }
    >
      <div className="space-y-4 text-sm">
        {data.notes.length > 0 && (
          <ol aria-label="Dispute notes" className="space-y-2">
            {data.notes.map((n) => (
              <li key={n.noteId} className="rounded-lg border border-edge p-2" data-testid="dispute-note">
                <p className="whitespace-pre-wrap break-words">{n.text}</p>
                <p className="mt-1 text-xs text-muted">{utc(n.at)}</p>
              </li>
            ))}
          </ol>
        )}
        {data.files.length > 0 && (
          <ul aria-label="Dispute photos" className="grid gap-3 sm:grid-cols-2">
            {data.files.map((f) => (
              <DisputePhoto key={f.fileId} file={f} />
            ))}
          </ul>
        )}
        {nothing && <p className="text-muted">No dispute evidence yet.</p>}
        {data.canAttach && party === 'client' && (
          <AddEvidence
            jobId={jobId}
            notesLeft={DISPUTE_LIMITS.notes - data.notes.length}
            photosLeft={DISPUTE_LIMITS.files - data.files.length}
            jobState={jobState}
            onDone={reload}
          />
        )}
      </div>
    </Card>
  );
}

function AddEvidence({
  jobId,
  notesLeft,
  photosLeft,
  jobState,
  onDone,
}: {
  jobId: string;
  notesLeft: number;
  photosLeft: number;
  jobState: string;
  onDone: () => void;
}) {
  const {authed} = useSession();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'note' | 'photo' | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function addNote() {
    const p = validateNote(text);
    setProblem(p);
    if (p) return;
    setBusy('note');
    try {
      await authed((t) => dispute.addNote(t, jobId, text.trim()));
      setText('');
      onDone();
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const p = validatePhoto(file);
    setPhotoProblem(p);
    if (p) return;
    setBusy('photo');
    try {
      await authed((t) => dispute.addPhoto(t, jobId, file, file.name));
      onDone();
    } catch (err) {
      setPhotoProblem(errorText(err));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-edge-strong p-4">
      <p className="text-xs text-muted">
        {jobState === 'submitted'
          ? 'You can add evidence now, before deciding; it stays with the job if you dispute.'
          : 'The dispute is open: evidence added now reaches the arbiter with the rest.'}{' '}
        {notesLeft} note{notesLeft === 1 ? '' : 's'} and {photosLeft} photo{photosLeft === 1 ? '' : 's'} left.
      </p>
      <Field
        label="Add a note"
        htmlFor="dispute-note"
        error={problem}
        hintId="dispute-note-hint"
        hint={`${DISPUTE_LIMITS.note.min}-${DISPUTE_LIMITS.note.max} characters. What is wrong, and where the arbiter can see it.`}
      >
        <TextArea
          id="dispute-note"
          rows={3}
          value={text}
          maxLength={DISPUTE_LIMITS.note.max}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="dispute-note-hint"
          aria-invalid={Boolean(problem) || undefined}
          disabled={notesLeft <= 0}
        />
      </Field>
      <Button
        size="sm"
        disabled={busy !== null || notesLeft <= 0}
        loading={busy === 'note'}
        onClick={() => void addNote()}
      >
        Add the note
      </Button>
      <Field
        label="Add a photo"
        htmlFor="dispute-photo"
        error={photoProblem}
        hintId="dispute-photo-hint"
        hint={`PNG, JPEG or WebP, at most ${bytesDisplay(8 * 1024 * 1024)}. Location and camera details are removed before it is stored.`}
      >
        <input
          ref={input}
          id="dispute-photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy !== null || photosLeft <= 0}
          aria-describedby="dispute-photo-hint"
          className="file-input block text-sm"
          onChange={(e) => void addPhoto(e.target.files)}
        />
      </Field>
    </div>
  );
}

function DisputePhoto({file}: {file: EvidenceFile}) {
  const {authed} = useSession();
  const [src, setSrc] = useState<string | null>(null);
  const [verified, setVerified] = useState<'yes' | 'no' | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <li className="space-y-2 rounded-lg border border-edge p-2" data-testid="dispute-photo">
      {src ? (
        // A blob URL of bytes fetched with the session: next/image cannot load it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`The client’s dispute evidence ${file.fileId.slice(0, 8)}`}
          className="h-40 w-full rounded object-contain"
        />
      ) : failed ? (
        <p className="text-xs text-broken">Could not load this photo.</p>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
      <p className="text-xs text-muted">
        {bytesDisplay(file.size)} · {utc(file.createdAt)}
        {verified === 'yes' && ' · sha256 matches'}
        {verified === 'no' && (
          <span role="alert" className="text-broken">
            {' '}
            · sha256 does not match
          </span>
        )}
      </p>
    </li>
  );
}

/**
 * The NEAR AI judge's attestation (2026-11-09 §14): which model ruled, the
 * response it signed, whether the API could verify the signature, and the
 * hash of the verdict. Shown on a job and on a run's step when present.
 */
export function JudgeCard({judge, compact = false}: {judge: JudgeAttestation; compact?: boolean}) {
  const verified = judge.verified === true;
  const rows: [string, string][] = [
    ['Model', `${judge.model} (${judge.provider})`],
    ['Response id', judge.responseId],
    ['Signed with', `${judge.signingAlgo} · ${judge.signingAddress}`],
    ['Verdict hash', judge.verdictHash],
    ['Verified at', utc(judge.verifiedAt)],
  ];
  const body = (
    <dl
      className={`grid gap-x-6 gap-y-1 text-xs ${compact ? '' : 'sm:grid-cols-[8rem_1fr]'}`}
      data-testid="judge-attestation"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="tabular break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
  if (compact) {
    return (
      <div className="space-y-1 rounded-lg border border-edge p-2">
        <p className="flex items-center gap-2 text-xs font-medium">
          Judge attestation
          <Badge tone={verified ? 'settled' : 'refused'}>
            {verified ? 'signature verified' : 'not verified'}
          </Badge>
        </p>
        {body}
      </div>
    );
  }
  return (
    <Card
      title="Judge attestation"
      labelledBy="judge"
      description="The AI judge signed its ruling; the API checked the signature against the provider's attested key."
      actions={
        <Badge tone={verified ? 'settled' : 'refused'}>
          {verified ? 'Signature verified' : 'Signature not verified'}
        </Badge>
      }
    >
      {body}
    </Card>
  );
}
