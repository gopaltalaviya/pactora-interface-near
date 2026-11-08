'use client';

import {useCallback, useEffect, useState} from 'react';
import {errorText, SignInGate} from '@/components/market/hooks';
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
import {functionCall} from '@/lib/wallet';

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
  const [tab, setTab] = useState<'disputes' | 'moderation' | 'compliance'>('disputes');

  useEffect(() => {
    authed((t) => admin.me(t))
      .then((m) => {
        setMe(m);
        setTab(m.roles.includes('council') ? 'disputes' : 'compliance');
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, [authed]);

  if (error) return <ErrorState title="No admin access">{error}</ErrorState>;
  if (!me) return <Skeleton className="h-40 w-full" />;
  const tabs = [
    ...(me.roles.includes('council') ? [['disputes', 'Dispute desk'] as const] : []),
    ['moderation', 'Moderation'] as const,
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
        {tab === 'disputes' && <Disputes />}
        {tab === 'moderation' && <Moderation />}
        {tab === 'compliance' && <Compliance />}
      </div>
    </div>
  );
}

/** Sign a call the API built, with the member's own wallet. */
function useSendBuilt() {
  const {ensureWallet, account} = useSession();
  return useCallback(
    async (fc: BuiltCall) => {
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
    [ensureWallet, account],
  );
}

function Disputes() {
  const {authed} = useSession();
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
            </Button>
          </li>
        ))}
      </ul>
      {open && <DisputeDetail key={open} jobId={open} />}
    </div>
  );
}

function DisputeDetail({jobId}: {jobId: string}) {
  const {authed} = useSession();
  const send = useSendBuilt();
  const [d, setD] = useState<Dispute | null>(null);
  const [proposals, setProposals] = useState<{council: string[]; proposals: Proposal[]} | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
      await send(built.functionCall);
      setNotice(`Proposed to the DAO: ${rulingWords(forWorker)}. Two council votes rule it.`);
      setAttempt((n) => n + 1);
    } catch (err) {
      setProblem(errorText(err));
    }
  }
  async function vote(p: Proposal, action: 'VoteApprove' | 'VoteReject') {
    setProblem(null);
    try {
      const built = await authed((t) => admin.vote(t, jobId, p.id, action));
      await send(built.functionCall);
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
          Client: {d.client.name ?? d.client.agentId} · Worker: {d.worker.name ?? d.worker.agentId} · Amount{' '}
          {d.amount} base units
        </p>
        {d.resultMismatch && <Notice>The result on chain differs from the delivered one.</Notice>}
        {d.drafts.length > 0 && (
          <div>
            <h3 className="font-medium">Draft rounds</h3>
            <ol className="space-y-1">
              {d.drafts.map((x) => (
                <li key={x.round}>
                  Round {x.round}: <span className="whitespace-pre-wrap break-words">{x.snapshot.text}</span>{' '}
                  <code className="text-xs text-muted">{x.snapshotHash.slice(0, 12)}…</code>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p>
          {d.files.length} photo(s) · {d.messages.length} message(s) · {d.timeline.length} event(s)
        </p>
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
                Proposal {p.id}: {rulingWords(p.forWorker)} — {p.status} —{' '}
                {tally(p, proposals.council.length || 3)}
                {p.status === 'InProgress' && !p.youVoted && (
                  <span className="ml-2 inline-flex gap-2">
                    <Button size="sm" onClick={() => void vote(p, 'VoteApprove')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void vote(p, 'VoteReject')}>
                      Reject
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
  const [reason, setReason] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    authed((t) => admin.cases(t))
      .then((c) => setCases(c.cases))
      .catch((err: unknown) => setProblem(errorText(err)));
  }, [authed, attempt]);
  if (!cases)
    return problem ? (
      <ErrorState title="No access to the compliance queue">{problem}</ErrorState>
    ) : (
      <Skeleton className="h-24 w-full" />
    );
  if (cases.length === 0) return <p className="text-sm text-muted">No open cases.</p>;
  const decide = (c: ComplianceCase, decision: 'clear' | 'confirm') =>
    void authed((t) => admin.decide(t, c.caseId, decision, reason[c.caseId] ?? '', c.version))
      .then(() => setAttempt((n) => n + 1))
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
