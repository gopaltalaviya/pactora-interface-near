'use client';

import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {errorText, networkPromise, SignInGate, useNetwork} from '@/components/market/hooks';
import {amountDisplay} from '@/lib/market';
import {
  REPORT_ACTIONS,
  reports as reportsApi,
  targetHref,
  type Report,
  type ReportAction,
} from '@/lib/reports';
import {describeError} from '@/lib/errors';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, TextInput} from '@/components/ui/Field';
import {PageHeader} from '@/components/ui/PageHeader';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {
  admin,
  rulingWords,
  tally,
  type AdminMe,
  type AdminReview,
  type BuiltCall,
  type ComplianceCase,
  type Dispute,
  type Proposal,
} from '@/lib/admin';
import {useSession} from '@/lib/session';
import {auditFilename, auditRange, defaultAuditDates} from '@/lib/audit-export';
import {functionCall} from '@/lib/wallet';
import {checkDaoCall, type DaoExpectation} from '@/lib/wallet-guard';

/**
 * The admin console (docs/26 F15): the DAO dispute desk for the arbiter's
 * council, moderation, and the compliance queue for reviewers. Who sees what
 * is decided by the API on every request; this page only shows the tabs the
 * API says you have.
 */
export function AdminView() {
  const session = useSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Admin console"
        description="For the arbiter council and compliance reviewers. Rulings are proposals to the arbiter DAO, signed with your own wallet."
      />
      <SignInGate what="use the admin console">{session.status === 'in' && <Console />}</SignInGate>
    </div>
  );
}

function Console() {
  const {authed} = useSession();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'disputes' | 'moderation' | 'compliance' | 'reports'>('disputes');

  useEffect(() => {
    authed((t) => admin.me(t))
      .then((m) => {
        setMe(m);
        setTab(m.roles.includes('council') ? 'disputes' : 'compliance');
      })
      .catch((err: unknown) => setError(describeError(err).text));
  }, [authed]);

  if (error) return <ErrorState title="No admin access">{error}</ErrorState>;
  if (!me) return <Skeleton className="h-40 w-full" />;
  const tabs = [
    ...(me.roles.includes('council') ? [['disputes', 'Dispute desk'] as const] : []),
    ['moderation', 'Moderation'] as const,
    ...(me.roles.includes('reviewer') ? [['reports', 'Reports'] as const] : []),
    ...(me.roles.includes('reviewer') ? [['compliance', 'Compliance'] as const] : []),
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm" data-testid="admin-roles">
        Signed in as <span className="tabular">{me.account}</span>:{' '}
        {me.roles.map((r) => (
          <Badge key={r} tone="chain">
            {r === 'council' ? 'Arbiter council' : 'Compliance reviewer'}
          </Badge>
        ))}
        {me.arbiterDao && <span className="ml-2 text-muted">DAO {me.arbiterDao}</span>}
      </p>
      <div role="tablist" aria-label="Admin sections" className="flex gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`rounded-lg border px-3 py-1.5 text-sm ${tab === id ? 'border-accent text-text' : 'border-edge text-muted'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'disputes' && <Disputes dao={me.arbiterDao} />}
        {tab === 'moderation' && <Moderation />}
        {tab === 'reports' && <Reports />}
        {tab === 'compliance' && <Compliance />}
      </div>
    </div>
  );
}

type DaoAsk = {kind: 'propose'} | {kind: 'vote'; proposalId: number; action: 'VoteApprove' | 'VoteReject'};

/**
 * Sign a call the API built, with the member's own wallet — after holding it
 * against what the member asked for (lib/wallet-guard.ts): the arbiter DAO
 * named by /v1/admin/me or the network, a proposal or the vote on the
 * proposal that was clicked, and no deposit beyond the DAO's bond. The API
 * says what a ruling looks like; it does not get to change what is signed.
 */
function useSendBuilt(dao: string | null) {
  const {ensureWallet, account} = useSession();
  return useCallback(
    async (fc: BuiltCall, ask: DaoAsk) => {
      const {contracts} = await networkPromise();
      checkDaoCall(fc, {...ask, dao, contracts} as DaoExpectation);
      const wallet = await ensureWallet();
      await wallet.signAndSendTransactions({
        ...(account ? {signerId: account} : {}),
        transactions: [
          {
            receiverId: fc.receiverId,
            actions: [functionCall(fc.methodName, fc.args, {gas: fc.gas, deposit: fc.deposit})],
          },
        ],
      });
    },
    [ensureWallet, account, dao],
  );
}

const STATUS_WORDS: Record<string, string> = {
  InProgress: 'open for votes',
  Approved: 'approved',
  Rejected: 'rejected',
  Expired: 'expired',
  Failed: 'failed',
  Removed: 'removed',
};
const statusWords = (s: string) => STATUS_WORDS[s] ?? s;

function Disputes({dao}: {dao: string | null}) {
  const {authed} = useSession();
  const token = useNetwork();
  const [list, setList] = useState<{jobId: string; chainJobId: string | null; amount: string}[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    authed((t) => admin.disputes(t))
      .then((d) => setList(d.disputes))
      .catch(() => setList([]));
  }, [authed]);
  if (!list) return <Skeleton className="h-24 w-full" />;
  if (list.length === 0) return <p className="text-sm text-muted">No open disputes.</p>;
  return (
    <div className="space-y-4">
      <ul aria-label="Disputes" className="space-y-2">
        {list.map((d) => (
          <li key={d.jobId}>
            <Button
              size="sm"
              variant={open === d.jobId ? 'primary' : 'secondary'}
              onClick={() => setOpen(d.jobId)}
            >
              Job {d.chainJobId ?? d.jobId.slice(0, 8)}
            </Button>{' '}
            <span className="text-xs text-muted">
              {token ? amountDisplay(d.amount, token.decimals, token.symbol) : `${d.amount} base units`}
            </span>
          </li>
        ))}
      </ul>
      {open && <DisputeDetail key={open} jobId={open} dao={dao} />}
    </div>
  );
}

function DisputeDetail({jobId, dao}: {jobId: string; dao: string | null}) {
  const {authed} = useSession();
  const token = useNetwork();
  const send = useSendBuilt(dao);
  const [d, setD] = useState<Dispute | null>(null);
  const [proposals, setProposals] = useState<{council: string[]; proposals: Proposal[]} | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A Reject vote is asked twice: it is a ruling against one party, signed on chain.
  const [confirmReject, setConfirmReject] = useState<number | null>(null);

  useEffect(() => {
    authed((t) => admin.dispute(t, jobId))
      .then(setD)
      .catch((err: unknown) => setProblem(errorText(err)));
    authed((t) => admin.proposals(t, jobId))
      .then((p) => setProposals({council: p.council ?? [], proposals: p.proposals}))
      .catch(() => setProposals({council: [], proposals: []}));
  }, [authed, jobId, attempt]);

  async function propose(forWorker: boolean) {
    if (!d) return;
    setProblem(null);
    try {
      const built = await authed((t) => admin.propose(t, jobId, forWorker, d.evidenceHash));
      await send(built.functionCall, {kind: 'propose'});
      setNotice(`Proposed to the DAO: ${rulingWords(forWorker)}. Two council votes rule it.`);
      setAttempt((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    }
  }
  async function vote(p: Proposal, action: 'VoteApprove' | 'VoteReject') {
    setProblem(null);
    setConfirmReject(null);
    try {
      const built = await authed((t) => admin.vote(t, jobId, p.id, action));
      await send(built.functionCall, {kind: 'vote', proposalId: p.id, action});
      setNotice(`Vote sent on proposal ${p.id}.`);
      setAttempt((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    }
  }

  if (!d)
    return problem ? (
      <ErrorState title="Could not load the dispute">{problem}</ErrorState>
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  return (
    <Card title={`Dispute — job ${d.chainJobId ?? d.jobId}`} labelledBy="dispute-detail">
      <div className="space-y-4 text-sm">
        <p>
          <strong>The client&apos;s reason:</strong>{' '}
          <span className="whitespace-pre-wrap break-words" data-testid="dispute-reason">
            {d.disputeReason ?? '(none recorded)'}
          </span>
        </p>
        <p>
          Client:{' '}
          <Link href={`/agents/${d.client.agentId}`} className="text-accent underline">
            {d.client.name ?? `agent #${d.client.agentId}`}
          </Link>{' '}
          · Worker:{' '}
          <Link href={`/agents/${d.worker.agentId}`} className="text-accent underline">
            {d.worker.name ?? `agent #${d.worker.agentId}`}
          </Link>{' '}
          · Amount{' '}
          <span className="tabular" data-testid="dispute-amount">
            {token ? amountDisplay(d.amount, token.decimals, token.symbol) : `${d.amount} base units`}
          </span>{' '}
          ·{' '}
          <Link href={`/jobs/${d.jobId}`} className="text-accent underline">
            the job
          </Link>
        </p>
        {d.resultMismatch && <Notice>The result on chain differs from the delivered one.</Notice>}
        {d.drafts.length > 0 && (
          <div>
            <h3 className="font-medium">Draft rounds</h3>
            <ol className="space-y-1">
              {d.drafts.map((x) => (
                <li key={x.round}>
                  <span className="text-muted">Round {x.round}:</span>{' '}
                  <span className="whitespace-pre-wrap break-words">{x.snapshot.text}</span>{' '}
                  <code className="text-xs text-muted">{x.snapshotHash.slice(0, 12)}…</code>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p>
          {d.files.length} evidence photo{d.files.length === 1 ? '' : 's'} · {d.messages.length} message
          {d.messages.length === 1 ? '' : 's'} · {d.timeline.length} event{d.timeline.length === 1 ? '' : 's'}
        </p>
        {d.files.length > 0 && (
          <ul aria-label="Evidence photos" className="grid gap-2 sm:grid-cols-3">
            {d.files.map((f) => (
              <AdminPhoto
                key={f.fileId}
                url={f.url}
                sha256={f.sha256}
                label={`evidence ${f.fileId.slice(0, 8)}`}
              />
            ))}
          </ul>
        )}
        {(d.disputeNotes?.length ?? 0) > 0 && (
          <div data-testid="desk-dispute-notes">
            <h3 className="font-medium">The client&apos;s dispute notes</h3>
            <ol className="space-y-1">
              {d.disputeNotes!.map((n) => (
                <li key={n.noteId} className="whitespace-pre-wrap break-words">
                  {n.text}
                </li>
              ))}
            </ol>
          </div>
        )}
        {(d.disputeFiles?.length ?? 0) > 0 && (
          <ul
            aria-label="Dispute photos"
            className="grid gap-2 sm:grid-cols-3"
            data-testid="desk-dispute-photos"
          >
            {d.disputeFiles!.map((f) => (
              <AdminPhoto
                key={f.fileId}
                url={f.url}
                sha256={f.sha256}
                label={`dispute photo ${f.fileId.slice(0, 8)}`}
              />
            ))}
          </ul>
        )}
        {d.messages.length > 0 && (
          <ol aria-label="Conversation" className="max-h-60 space-y-1 overflow-auto">
            {d.messages.map((m) => (
              <li key={m.messageId}>
                <span className="text-muted">{m.from}:</span>{' '}
                <span className="whitespace-pre-wrap break-words">{m.body}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="break-all text-xs text-muted">
          Evidence sha256: <code data-testid="evidence-hash">{d.evidenceHash}</code> — a proposal is bound to
          it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void propose(true)}>Propose: pay the worker</Button>
          <Button variant="danger" onClick={() => void propose(false)}>
            Propose: refund the client
          </Button>
        </div>
        {proposals && proposals.proposals.length > 0 && (
          <ul aria-label="Proposals" className="space-y-2">
            {proposals.proposals.map((p) => (
              <li key={p.id} className="rounded-lg border border-edge p-2" data-testid={`proposal-${p.id}`}>
                Proposal {p.id}: {rulingWords(p.forWorker)} — {statusWords(p.status)} —{' '}
                {tally(p, proposals.council.length || 3)}
                {p.status === 'InProgress' && !p.youVoted && confirmReject !== p.id && (
                  <span className="ml-2 inline-flex gap-2">
                    <Button size="sm" onClick={() => void vote(p, 'VoteApprove')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmReject(p.id)}>
                      Reject
                    </Button>
                  </span>
                )}
                {p.status === 'InProgress' && !p.youVoted && confirmReject === p.id && (
                  <span className="ml-2 inline-flex flex-wrap items-center gap-2">
                    <span className="text-muted">Your wallet signs a Reject vote on proposal {p.id}.</span>
                    <Button size="sm" variant="danger" onClick={() => void vote(p, 'VoteReject')}>
                      Confirm the Reject vote
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmReject(null)}>
                      Not now
                    </Button>
                  </span>
                )}
                {p.youVoted && <span className="ml-2 text-muted">You voted {p.youVoted}.</span>}
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <p role="status" data-testid="desk-notice">
            {notice}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-broken">
            {problem}
          </p>
        )}
      </div>
    </Card>
  );
}

/** An evidence photo on the desk, fetched with the session (GET /v1/admin/files/:id, falling back to the party route). */
function AdminPhoto({url, sha256, label}: {url: string; sha256: string; label: string}) {
  const {authed} = useSession();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let blobUrl: string | null = null;
    const adminUrl = url.replace(/^\/v1\/files\//, '/v1/admin/files/');
    authed((t) => admin.file(t, adminUrl).catch(() => admin.file(t, url)))
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [authed, url]);
  return (
    <li className="rounded-lg border border-edge p-1">
      {src ? (
        // A blob URL fetched with the session: next/image cannot load it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-28 w-full rounded object-contain" />
      ) : failed ? (
        <p className="p-2 text-xs text-broken">Could not load {label}.</p>
      ) : (
        <Skeleton className="h-28 w-full" />
      )}
      <p className="truncate px-1 text-[10px] text-muted" title={sha256}>
        sha256 {sha256.slice(0, 12)}…
      </p>
    </li>
  );
}

/** Reports from people (2026-11-09 §9): compliance reviewers resolve each with one of four actions. */
function Reports() {
  const {authed} = useSession();
  const [status, setStatus] = useState<Report['status']>('open');
  const [rows, setRows] = useState<Report[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [resolving, setResolving] = useState<{id: string; action: ReportAction} | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(null);
    authed((t) => reportsApi.list(t, status))
      .then((r) => setRows(r.reports))
      .catch((err: unknown) => setProblem(errorText(err)));
  }, [authed, status, attempt]);

  async function resolve() {
    if (!resolving) return;
    if (note.trim().length < 3) {
      setProblem('A note of 3-500 characters is needed.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await authed((t) => reportsApi.resolve(t, resolving.id, resolving.action, note.trim()));
      setResolving(null);
      setNote('');
      setAttempt((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Report status" className="flex gap-2">
        {(['open', 'resolved', 'dismissed'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'primary' : 'secondary'}
            onClick={() => setStatus(s)}
          >
            {s[0]!.toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {!rows && !problem && <Skeleton className="h-24 w-full" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted" data-testid="no-reports">
          No {status} reports.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul aria-label="Reports" className="space-y-2 text-sm">
          {rows.map((r) => {
            const href = targetHref(r);
            return (
              <li
                key={r.reportId}
                className="rounded-lg border border-edge p-3"
                data-testid={`report-${r.reportId}`}
              >
                <p>
                  <Badge tone="refused">{r.reason}</Badge> {r.targetType}{' '}
                  {href ? (
                    <Link href={href} className="text-accent underline">
                      {r.targetId}
                    </Link>
                  ) : (
                    <code className="text-xs">{r.targetId}</code>
                  )}{' '}
                  <span className="text-muted">· reported by a {r.reporter.kind}</span>
                </p>
                {r.details && <p className="mt-1 whitespace-pre-wrap break-words text-muted">{r.details}</p>}
                {r.status !== 'open' ? (
                  <p className="mt-1 text-xs text-muted">
                    {r.status === 'dismissed' ? 'Dismissed' : `Resolved: ${r.action}`} — {r.note}
                  </p>
                ) : resolving?.id === r.reportId ? (
                  <form
                    className="mt-2 space-y-2"
                    aria-label="Resolve this report"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void resolve();
                    }}
                  >
                    <p className="text-xs text-muted">
                      {REPORT_ACTIONS.find((a) => a.value === resolving.action)?.label}:{' '}
                      {REPORT_ACTIONS.find((a) => a.value === resolving.action)?.what}.
                    </p>
                    <Field label="Note (3-500 characters)" htmlFor={`note-${r.reportId}`}>
                      <TextInput
                        id={`note-${r.reportId}`}
                        value={note}
                        maxLength={500}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        variant={resolving.action === 'block' ? 'danger' : 'primary'}
                        loading={busy}
                      >
                        Confirm: {REPORT_ACTIONS.find((a) => a.value === resolving.action)?.label}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setResolving(null)}>
                        Not now
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {REPORT_ACTIONS.map((a) => (
                      <Button
                        key={a.value}
                        size="sm"
                        variant={a.value === 'block' ? 'danger' : 'secondary'}
                        onClick={() => {
                          setResolving({id: r.reportId, action: a.value});
                          setNote('');
                          setProblem(null);
                        }}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {problem && (
        <p role="alert" className="text-broken">
          {problem}
        </p>
      )}
    </div>
  );
}

function Moderation() {
  const {authed} = useSession();
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    authed((t) => admin.reviews(t))
      .then((r) => setReviews(r.reviews))
      .catch((err: unknown) => setProblem(errorText(err)));
  }, [authed, attempt]);
  if (!reviews)
    return problem ? (
      <ErrorState title="Could not load reviews">{problem}</ErrorState>
    ) : (
      <Skeleton className="h-24 w-full" />
    );
  return (
    <ul aria-label="Reviews to moderate" className="space-y-2 text-sm">
      {reviews.map((r) => (
        <li key={r.reviewId} className="rounded-lg border border-edge p-2" data-testid={`mod-${r.reviewId}`}>
          <p>
            {r.rating}/5 by the {r.authorRole}:{' '}
            <span className="whitespace-pre-wrap break-words">{r.body}</span>
          </p>
          {r.hidden ? (
            <p className="text-muted">Hidden: {r.hiddenReason}</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <Field label="Why hide it" htmlFor={`hide-${r.reviewId}`}>
                <TextInput
                  id={`hide-${r.reviewId}`}
                  value={reasons[r.reviewId] ?? ''}
                  onChange={(e) => setReasons((x) => ({...x, [r.reviewId]: e.target.value}))}
                />
              </Field>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  void authed((t) => admin.hide(t, r.reviewId, reasons[r.reviewId] ?? ''))
                    .then(() => setAttempt((n) => n + 1))
                    .catch((err: unknown) => setProblem(errorText(err)))
                }
              >
                Hide
              </Button>
            </div>
          )}
        </li>
      ))}
      {problem && (
        <li role="alert" className="text-broken">
          {problem}
        </li>
      )}
    </ul>
  );
}

function Compliance() {
  const {authed} = useSession();
  const [cases, setCases] = useState<ComplianceCase[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    authed((t) => admin.cases(t))
      .then((c) => setCases(c.cases))
      .catch((err: unknown) => setProblem(errorText(err)));
  }, [authed, attempt]);
  return (
    <div className="space-y-6">
      <AuditExport />
      {!cases ? (
        problem ? (
          <ErrorState title="No access to the compliance queue">{problem}</ErrorState>
        ) : (
          <Skeleton className="h-24 w-full" />
        )
      ) : cases.length === 0 ? (
        <p className="text-sm text-muted">No open cases.</p>
      ) : (
        <CaseList
          cases={cases}
          problem={problem}
          setProblem={setProblem}
          onDecided={() => setAttempt((n) => n + 1)}
        />
      )}
    </div>
  );
}

function CaseList({
  cases,
  problem,
  setProblem,
  onDecided,
}: {
  cases: ComplianceCase[];
  problem: string | null;
  setProblem: (p: string | null) => void;
  onDecided: () => void;
}) {
  const {authed} = useSession();
  const [reason, setReason] = useState<Record<string, string>>({});
  const decide = (c: ComplianceCase, decision: 'clear' | 'confirm') =>
    void authed((t) => admin.decide(t, c.caseId, decision, reason[c.caseId] ?? '', c.version))
      .then(onDecided)
      .catch((err: unknown) => setProblem(errorText(err)));
  return (
    <ul aria-label="Compliance cases" className="space-y-2 text-sm">
      {cases.map((c) => (
        <li key={c.caseId} className="rounded-lg border border-edge p-2" data-testid={`case-${c.caseId}`}>
          <p>
            <Badge tone={c.strength === 'strong' ? 'broken' : 'neutral'}>{c.strength}</Badge> &quot;
            {c.queryName}&quot; ~ &quot;
            {c.matchedName}&quot; ({c.source} {c.entryRef}, score {c.score.toFixed(3)}) · {c.subjectAccount}
          </p>
          <p className="text-muted">
            {c.decisions.length} decision(s){c.strength === 'strong' ? '; clearing needs two reviewers' : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <Field label="Reason (10-2000 characters)" htmlFor={`case-${c.caseId}-reason`}>
              <TextInput
                id={`case-${c.caseId}-reason`}
                value={reason[c.caseId] ?? ''}
                onChange={(e) => setReason((x) => ({...x, [c.caseId]: e.target.value}))}
              />
            </Field>
            <Button size="sm" onClick={() => decide(c, 'clear')}>
              Clear
            </Button>
            <Button size="sm" variant="danger" onClick={() => decide(c, 'confirm')}>
              Confirm match
            </Button>
          </div>
        </li>
      ))}
      {problem && (
        <li role="alert" className="text-broken">
          {problem}
        </li>
      )}
    </ul>
  );
}

/**
 * The compliance audit log as a CSV file (Round 3): every screening, identity
 * check, standing change and report resolution in the dates chosen, the last
 * day included. Accounts and outcomes only: the API leaves out names,
 * documents, report details and free-text notes.
 */
function AuditExport() {
  const {authed} = useSession();
  const [dates, setDates] = useState(() => defaultAuditDates(new Date()));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onExport(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    setDone(null);
    const range = auditRange(dates.from, dates.to);
    if (!range.ok) {
      setProblem(range.problem);
      return;
    }
    setBusy(true);
    try {
      const blob = await authed((t) => admin.auditLog(t, range.from, range.to));
      const filename = auditFilename(range.from, range.to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(`Downloaded ${filename}.`);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Export audit log"
      onSubmit={(e) => void onExport(e)}
      className="space-y-3 rounded-lg border border-edge p-3 text-sm"
    >
      <div>
        <h3 className="font-medium">Audit log</h3>
        <p className="text-xs text-muted">
          Screenings, identity checks, standing changes and report resolutions, oldest first: when, who
          decided (or the system), about which account, and the outcome. No legal or matched names, documents,
          report details or reviewers&apos; notes. Up to 366 days in one file; six exports a minute.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" htmlFor="audit-from">
          <TextInput
            id="audit-from"
            type="date"
            value={dates.from}
            onChange={(e) => setDates((d) => ({...d, from: e.target.value}))}
            disabled={busy}
          />
        </Field>
        <Field label="To (included)" htmlFor="audit-to">
          <TextInput
            id="audit-to"
            type="date"
            value={dates.to}
            onChange={(e) => setDates((d) => ({...d, to: e.target.value}))}
            disabled={busy}
          />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={busy}>
          Export audit log (CSV)
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-broken">
          {problem}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-muted">
          {done}
        </p>
      )}
    </form>
  );
}
