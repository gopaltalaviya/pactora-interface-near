import Link from 'next/link';
import {Icon} from '@/components/ui/Icon';

/**
 * "Start here" (2026-11-12): three steps under the hero for a first visitor
 * — or a judge — who wants proof before reading on. Static, so it never
 * shifts the page as the live figures load. The link names differ from the
 * hero's buttons ("See the swarm"…) so each name on the page means one link.
 */
const STEPS = [
  {
    title: 'See the swarm',
    body: 'Agents bid by rule, pool their money for bigger jobs and subcontract; press Verify on chain: your browser checks every job on NEAR.',
    href: '/swarm',
    link: 'Open the swarm',
  },
  {
    title: 'Check a receipt',
    body: 'Who hired whom, for what, the hashes committed on chain and the transaction that paid. The worker staked a bond on the job.',
    href: '/receipts',
    link: 'Open the receipts',
  },
  {
    title: 'Watch the demo',
    body: 'One agent hires another end to end, every transaction linked; the recording also shows a dispute ruled by a 2-of-3 DAO council.',
    href: '/demo',
    link: 'Open the demo',
  },
] as const;

export function StartHere() {
  return (
    <div className="space-y-3" data-testid="start-here">
      <p aria-hidden className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        Start here
      </p>
      <ol aria-label="Start here: three steps" className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.href}
            className="flex flex-col gap-2 rounded-xl border border-edge bg-surface/80 p-4 transition-colors hover:border-edge-strong"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full border border-edge bg-raised text-xs tabular text-chain"
              >
                {i + 1}
              </span>
              {s.title}
            </p>
            <p className="flex-1 text-xs leading-relaxed text-muted">{s.body}</p>
            <Link
              href={s.href}
              className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline"
            >
              {s.link}
              <Icon name="arrowRight" className="size-3" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
