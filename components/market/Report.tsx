'use client';

import {useEffect, useRef, useState} from 'react';
import {errorText, useSignInHref} from '@/components/market/hooks';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Field, Select, TextArea} from '@/components/ui/Field';
import {REPORT_LIMITS, REPORT_REASONS, reports, type ReportReason, type ReportTarget} from '@/lib/reports';
import {useSession} from '@/lib/session';

/**
 * "Report" on a listing, a profile, an agent or a message (2026-11-09 §9): a
 * small inline form with the reason and optional details, sent as one
 * report. The API refuses a second open report on the same target by the
 * same person, so sending twice cannot pile up.
 */
export function ReportButton({
  targetType,
  targetId,
  what,
  size = 'sm',
}: {
  targetType: ReportTarget;
  targetId: string;
  /** What is being reported, for the heading: "this listing", "this message". */
  what: string;
  size?: 'sm' | 'md';
}) {
  const {status} = useSession();
  const signIn = useSignInHref();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const first = useRef<HTMLSelectElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const {authed} = useSession();

  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);

  if (sent) {
    return (
      <p role="status" className="text-xs text-muted" data-testid="report-sent">
        Reported. A compliance reviewer looks at it; you are not told the outcome.
      </p>
    );
  }
  if (!open) {
    return (
      <Button ref={button} size={size} variant="ghost" onClick={() => setOpen(true)} aria-expanded={false}>
        Report
      </Button>
    );
  }
  if (status !== 'in') {
    return (
      <p className="text-xs text-muted">
        Sign in to report {what}.{' '}
        <ButtonLink icon="key" href={signIn} size="sm" variant="ghost">
          Sign in
        </ButtonLink>
      </p>
    );
  }

  async function send() {
    if (!reason) {
      setProblem('Choose a reason.');
      first.current?.focus();
      return;
    }
    if (details.length > REPORT_LIMITS.details) {
      setProblem(`Details are at most ${REPORT_LIMITS.details} characters.`);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await authed((t) =>
        reports.send(t, {targetType, targetId, reason, ...(details.trim() ? {details: details.trim()} : {})}),
      );
      setSent(true);
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const id = `report-${targetType}-${targetId.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <form
      aria-label={`Report ${what}`}
      className="space-y-3 rounded-lg border border-edge-strong p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Field label={`Why are you reporting ${what}?`} htmlFor={`${id}-reason`} error={problem}>
        <Select
          id={`${id}-reason`}
          ref={first}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason | '')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setTimeout(() => button.current?.focus(), 0);
            }
          }}
          aria-invalid={Boolean(problem) || undefined}
        >
          <option value="">Choose…</option>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Details (optional)"
        htmlFor={`${id}-details`}
        hint="What a reviewer should look at. At most 1000 characters."
      >
        <TextArea
          id={`${id}-details`}
          rows={2}
          value={details}
          maxLength={REPORT_LIMITS.details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button icon="send" type="submit" size="sm" variant="danger" loading={busy} disabled={busy}>
          Send the report
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </form>
  );
}
