import Link from 'next/link';
import type {ModelStatus} from '@/lib/api';
import {relativeTime} from '@/lib/format';
import {Icon} from './ui/Icon';

/**
 * The hosted demo's agents think with a free-tier AI key, which has a small
 * daily quota. When it is used up a run cannot think — and a reader must not
 * mistake that for the protocol failing. These say plainly which it is, and
 * point at the proof that the rest works.
 */

export const DEMO_VIDEO = 'https://youtu.be/IQESfGqXn1M';

/** A run that failed because the AI model could not answer (current and older wording). */
export function isModelFailure(text: string | null | undefined): boolean {
  return !!text && /AI model unavailable|could not reach its model/.test(text);
}

function Proof({lastDelivered}: {lastDelivered: ModelStatus['lastDelivered'] | undefined}) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1">
      {lastDelivered && (
        <Link href={`/runs/${lastDelivered.runId}`} className="text-accent underline">
          See the last run that delivered
        </Link>
      )}
      <a href={DEMO_VIDEO} target="_blank" rel="noreferrer" className="text-accent underline">
        Watch a recorded live run (2:35)
        <span className="sr-only"> (opens YouTube in a new tab)</span>
      </a>
    </p>
  );
}

/** Before a run: the model's quota is used up right now. */
export function ModelLimitedNotice({model}: {model: ModelStatus}) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-refused/40 bg-refused/[0.07] p-4 text-sm leading-relaxed"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-refused" />
      <div className="space-y-2">
        <p className="font-medium text-text">
          The AI model is out of its free daily quota — Pactora itself is working.
        </p>
        <p className="text-muted">
          This hosted demo&apos;s agents think with a free-tier AI key, and today&apos;s requests are used up
          {model.since ? <> (since {relativeTime(model.since)})</> : null}. Escrow, payment, settlement and
          reputation on NEAR testnet are unaffected; a run started now will most likely stop with &ldquo;AI
          model unavailable&rdquo;, and nothing is paid for work that does not happen. The quota resets daily.
        </p>
        <Proof lastDelivered={model.lastDelivered} />
      </div>
    </div>
  );
}

/** After a run that failed because the model could not answer. */
export function ModelFailureNotice({
  error,
  lastDelivered,
}: {
  error: string;
  lastDelivered?: ModelStatus['lastDelivered'];
}) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-refused/40 bg-refused/[0.07] p-4 text-sm leading-relaxed"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-refused" />
      <div className="space-y-2">
        <p className="font-medium text-text">
          The AI model was unavailable — this is not a protocol failure.
        </p>
        <p className="text-muted">{error}</p>
        <p className="text-muted">
          The agents could not think, so no work was done and none was paid for: any hire was cancelled and
          refunded on chain. This demo uses a free-tier AI key with a small daily quota.
        </p>
        <Proof lastDelivered={lastDelivered} />
      </div>
    </div>
  );
}
