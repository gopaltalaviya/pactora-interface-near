'use client';

import {useEffect, useState} from 'react';
import {Badge, type Tone} from '@/components/ui/Badge';
import {Card} from '@/components/ui/Card';
import {api, type TrustReport} from '@/lib/api';

/**
 * Who paid for this record.
 *
 * The score proves every review cost a payment; it cannot tell thirty
 * clients from thirty wallets one owner funded — which is exactly how open,
 * payment-free rating registries have been farmed. This shows the trust check's verdict in its
 * own words, with the numbers behind it, so a reader judges the record rather
 * than a second score. Loads on its own: the page works without it, and an
 * API that predates it simply shows nothing here.
 */
const TONE: Record<TrustReport['verdict'], Tone> = {
  trusted: 'settled',
  new: 'neutral',
  concentrated: 'refused',
  failing: 'broken',
  'self-funded': 'broken',
};

const MEANING: Record<TrustReport['verdict'], string> = {
  trusted: 'paid by many owners, none of them funded by this agent',
  new: 'too little history to judge yet — unknown, not bad',
  concentrated: 'most of this record comes from few owners',
  failing: 'fails too often, whoever paid it',
  'self-funded': 'its clients were funded by its own side before they paid it',
};

export function TrustCard({agentId}: {agentId: number}) {
  const [report, setReport] = useState<TrustReport | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setUnavailable(false);
    api
      .trust(agentId, controller.signal)
      .then(setReport)
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, [agentId]);

  if (unavailable) return null;
  if (!report) {
    return (
      <Card title="Who paid for this record">
        <p className="text-sm text-muted">Checking who paid…</p>
      </Card>
    );
  }

  const m = report.metrics;
  return (
    <Card
      title="Who paid for this record"
      actions={
        <Badge tone={TONE[report.verdict]} dot>
          {report.verdict}
        </Badge>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          <span className="text-text">{MEANING[report.verdict]}.</span>{' '}
          {report.reasons.map((r) => `${r[0]!.toUpperCase()}${r.slice(1)}.`).join(' ')}
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Distinct client owners" value={m.clientOwners} />
          <Fact
            label="Most from one owner"
            value={m.settled > 0 ? `${m.topOwnerSettled} of ${m.settled}` : '—'}
          />
          <Fact label="Self-funded payments" value={m.selfFunded} warn={m.selfFunded > 0} />
          <Fact label="Trust score" value={m.trustScore} />
        </dl>
        <p className="text-xs leading-relaxed text-muted">
          The trust score counts at most three paid jobs per client owner and none that were self-funded.
          Funding is read from the payment token&apos;s own on-chain transfers
          {report.indexedToBlock ? `, up to block ${report.indexedToBlock}` : ''}.
        </p>
      </div>
    </Card>
  );
}

function Fact({label, value, warn = false}: {label: string; value: number | string; warn?: boolean}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular text-base ${warn ? 'text-broken' : 'text-text'}`}>{value}</dd>
    </div>
  );
}
