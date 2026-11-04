'use client';

import {useEffect, useState} from 'react';
import {api} from '@/lib/api';
import {reviewOf} from '@/lib/review';
import {Icon} from './ui/Icon';

/**
 * Under a settled step: proof that the worker's review was written on chain,
 * and what its score is now.
 *
 * The score is today's, not a snapshot from when the step settled — the
 * wording says "now" for that reason. While loading, or if either read fails,
 * this renders nothing: the step above already says it settled, and a
 * missing proof line is better than a wrong one.
 */
export function ReviewProof({jobId, agentId}: {jobId: string; agentId: number}) {
  const [proof, setProof] = useState<
    {written: true; explorerUrl: string | null; name: string; score: number} | {written: false} | null
  >(null);

  useEffect(() => {
    const c = new AbortController();
    Promise.all([api.job(jobId, c.signal), api.agent(agentId, c.signal)])
      .then(([job, agent]) => {
        const review = reviewOf(job);
        if (!review) return;
        setProof(review.written ? {...review, name: agent.name, score: agent.score} : review);
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [jobId, agentId]);

  if (!proof) return null;
  if (!proof.written) {
    return (
      <p className="mt-1.5 text-xs text-muted">
        Paid, but the reputation registry refused the review, so this job did not move the score.
      </p>
    );
  }
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-settled">
      <Icon name="check" className="size-3.5" />
      <span>
        Review written on chain for <span className="text-text">{proof.name}</span> — score now{' '}
        <span className="tabular text-text">{proof.score}</span>
      </span>
      {proof.explorerUrl && (
        <a href={proof.explorerUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          proof ↗<span className="sr-only"> (the settlement transaction, which wrote the review)</span>
        </a>
      )}
    </p>
  );
}
