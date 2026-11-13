'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Badge} from '@/components/ui/Badge';
import {Button} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {ErrorState, Notice, Skeleton} from '@/components/ui/States';
import {ApiError, api, type JobCredential} from '@/lib/api';
import {tokenHref} from '@/lib/credentials';
import {describeError} from '@/lib/errors';
import {safeHref} from '@/lib/links';
import {useSession} from '@/lib/session';

/**
 * The worker's work credential for a settled job (feature/work-credentials):
 * a soulbound NFT on NEAR that proves this paid job. The page shows it only to
 * the job's worker, signed in, on a network with a credentials contract.
 *
 * The API's minter issues it and pays for it, so the worker signs nothing.
 * Every change of state is announced politely; a failure says what happened
 * and what to do next.
 */

type Phase =
  | {kind: 'loading'}
  | {kind: 'none'}
  | {kind: 'claiming'}
  | {kind: 'pending'}
  | {kind: 'minted'; credential: JobCredential}
  | {kind: 'unavailable'; reason: string};

type Problem = {text: string; retryable: boolean; during: 'load' | 'claim'};

/** How many times a pending credential is asked about on its own before the worker is left to ask. */
const AUTO_CHECKS = 10;

/** A 503 that says why (no contract, no minter): not an outage, so not "try again". */
function unavailableReason(err: unknown): string | null {
  return err instanceof ApiError && err.code === 'UPSTREAM_UNAVAILABLE' && err.detail ? err.detail : null;
}

export function CredentialCard({
  jobId,
  contract,
  explorer = null,
  pollMs = 3000,
}: {
  jobId: string;
  /** The network's credentials contract (`contracts.Credentials`). */
  contract: string;
  /** The network's explorer base URL, for the token's own page. */
  explorer?: string | null;
  /** How often a pending credential is checked; 0 leaves it to the worker. */
  pollMs?: number;
}) {
  const {authed} = useSession();
  const [phase, setPhase] = useState<Phase>({kind: 'loading'});
  const [problem, setProblem] = useState<Problem | null>(null);
  const checks = useRef(0);

  const apply = useCallback((c: JobCredential) => {
    setProblem(null);
    if (c.available === false && c.status !== 'minted')
      setPhase({kind: 'unavailable', reason: 'this network has no credentials contract'});
    else if (c.status === 'minted') setPhase({kind: 'minted', credential: c});
    else if (c.status === 'pending') setPhase({kind: 'pending'});
    else setPhase({kind: 'none'});
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        apply(await api.credential(jobId, signal));
      } catch (err) {
        if (signal?.aborted) return;
        const reason = unavailableReason(err);
        if (reason) {
          setProblem(null);
          setPhase({kind: 'unavailable', reason});
          return;
        }
        const view = describeError(err, 'action');
        setProblem({text: view.text, retryable: view.retryable, during: 'load'});
        setPhase((p) => (p.kind === 'loading' ? {kind: 'none'} : p));
      }
    },
    [jobId, apply],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // A pending credential becomes final within seconds: ask again a few times, then leave it to the worker.
  useEffect(() => {
    if (phase.kind !== 'pending' || pollMs <= 0 || checks.current >= AUTO_CHECKS) return;
    const t = setTimeout(() => {
      checks.current += 1;
      void load();
    }, pollMs);
    return () => clearTimeout(t);
  }, [phase, pollMs, load]);

  async function claim() {
    setProblem(null);
    setPhase({kind: 'claiming'});
    try {
      checks.current = 0;
      apply(await authed((t) => api.claimCredential(t, jobId)));
    } catch (err) {
      const reason = unavailableReason(err);
      if (reason) {
        setPhase({kind: 'unavailable', reason});
        return;
      }
      const view = describeError(err, 'action');
      setProblem({text: view.text, retryable: view.retryable, during: 'claim'});
      setPhase({kind: 'none'});
    }
  }

  const badge =
    phase.kind === 'minted' ? (
      <Badge tone="settled" dot>
        Issued
      </Badge>
    ) : phase.kind === 'pending' || phase.kind === 'claiming' ? (
      <Badge tone="live" dot>
        Issuing
      </Badge>
    ) : undefined;

  return (
    <Card
      title="Work credential"
      labelledBy="work-credential"
      description="A record of this paid job that you keep, on NEAR."
      actions={badge}
    >
      <div className="space-y-4 text-sm" aria-live="polite">
        {phase.kind === 'loading' && (
          <div role="status" className="space-y-2">
            <span className="sr-only">Checking for your work credential</span>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-56" />
          </div>
        )}

        {(phase.kind === 'none' || phase.kind === 'claiming') && (
          <>
            <p className="leading-relaxed text-muted">
              Claim a work credential for this job: a non-transferable NFT on NEAR that proves you did this
              paid job — who paid, how much, and the fingerprints (hashes) of the task and your result. Anyone
              can check it on chain, and it stays with your account. Pactora pays to issue it, so it costs you
              nothing and you sign nothing.
            </p>
            <Button icon="shield" size="sm" loading={phase.kind === 'claiming'} onClick={() => void claim()}>
              Claim your work credential
            </Button>
            {phase.kind === 'claiming' && (
              <p data-testid="credential-status" className="text-muted">
                Issuing your credential on NEAR… this takes a few seconds.
              </p>
            )}
          </>
        )}

        {phase.kind === 'pending' && (
          <div className="space-y-3">
            <p data-testid="credential-status" className="text-muted">
              Your credential is being issued on NEAR. It shows here once the transaction is final, usually
              within a few seconds.
            </p>
            <Button icon="refresh" size="sm" variant="secondary" onClick={() => void load()}>
              Check again
            </Button>
          </div>
        )}

        {phase.kind === 'minted' && (
          <Minted credential={phase.credential} contract={contract} explorer={explorer} />
        )}

        {phase.kind === 'unavailable' && (
          <div data-testid="credential-unavailable">
            <Notice>
              <p>
                This server cannot issue work credentials right now. The reason it gave: “{phase.reason}”.
              </p>
              <p className="mt-1 text-muted">
                Your job and your payment are not affected. Come back later to claim it, or ask whoever runs
                this Pactora server.
              </p>
            </Notice>
          </div>
        )}

        {problem && (
          <ErrorState
            title={problem.text}
            action={
              problem.retryable ? (
                <Button
                  icon="refresh"
                  size="sm"
                  variant="secondary"
                  onClick={() => void (problem.during === 'claim' ? claim() : load())}
                >
                  Try again
                </Button>
              ) : undefined
            }
          >
            {problem.during === 'claim'
              ? 'No credential was issued, and nothing was spent.'
              : 'Your credential could not be looked up just now.'}
          </ErrorState>
        )}
      </div>
    </Card>
  );
}

function Minted({
  credential,
  contract,
  explorer,
}: {
  credential: JobCredential;
  contract: string;
  explorer: string | null;
}) {
  const issuer = credential.contract ?? contract;
  const tx = safeHref(credential.explorerUrl);
  const token = credential.tokenId ? tokenHref(explorer, issuer, credential.tokenId) : null;
  return (
    <div data-testid="credential-minted" className="space-y-2">
      <p>
        <strong>Credential #{credential.tokenId ?? '—'}</strong> is yours, issued by{' '}
        <span className="tabular break-all">{issuer}</span>.
      </p>
      <p className="leading-relaxed text-muted">
        You can see it in your NEAR wallet, among its collectibles (NFTs), as “Pactora Work Credentials”. It
        cannot be transferred or sold: it stays with the account that did the work.
      </p>
      {(tx || token) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {tx && (
            <a href={tx} target="_blank" rel="noreferrer" className="text-accent underline">
              See the issuing transaction ↗
              <span className="sr-only"> (opens the block explorer in a new tab)</span>
            </a>
          )}
          {token && (
            <a href={token} target="_blank" rel="noreferrer" className="text-accent underline">
              See the credential ↗<span className="sr-only"> on the block explorer, in a new tab</span>
            </a>
          )}
        </p>
      )}
    </div>
  );
}
