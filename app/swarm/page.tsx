import Link from 'next/link';
import {Badge} from '@/components/ui/Badge';
import {Icon} from '@/components/ui/Icon';
import {PageHeader} from '@/components/ui/PageHeader';
import {SwarmReplay} from '@/components/swarm/SwarmReplay';
import {VerifyOnChain} from '@/components/swarm/VerifyOnChain';
import {safeHref} from '@/lib/links';
import run from '@/lib/swarm-run.json';

/**
 * The swarm (2026-11-11): a recorded run of `scripts/swarm.mjs` in
 * pactora-backend-near, as data. Agents that follow a few lines of arithmetic
 * make a market through the real API, signer and contract: sellers bid by
 * rule, buyers choose by price and the reputation the chain wrote, three
 * buyers pool their money for one job none could buy alone, and a seller
 * subcontracts half its job to another. Every settlement names its chain job,
 * so a visitor can check each one on chain. Static: no key, no API call.
 */

interface Settlement {
  round: number;
  buyer: string;
  seller: string;
  amount: string;
  jobId: string;
  chainJobId: string | null;
  resultHash: string | null;
  txHash: string | null;
  explorerUrl: string | null;
}
interface Choice {
  round: number;
  buyer: string;
  ceiling: string;
  chose: string;
  options: {seller: string; price: string; reputation: number; score: number}[];
}
interface SwarmRun {
  network: string;
  chainId: string;
  contract: string;
  recordedAt: string;
  rules: {
    sellers: {name: string; floor: string; markdown: number; capacity: number}[];
    buyerScore: {price: number; reputation: number};
  };
  listings: {buyer: string; listingId: string; ceiling: string; round: number}[];
  bids: {seller: string; listingId: string; price: string; round: number}[];
  choices: Choice[];
  pool: {
    poolId: string;
    worker: string;
    share: string;
    total: string;
    perTaskCap: string;
    members: string[];
    resultHash: string | null;
    sameDelivery: boolean;
    state: string;
    jobs: {buyer: string; jobId: string; chainJobId: string}[];
  } | null;
  subcontract: {
    client: string;
    middle: string;
    sub: string;
    parent: {jobId: string; chainJobId: string; amount: string};
    child: {jobId: string; chainJobId: string; amount: string};
    middleNet: string;
  } | null;
  settlements: Settlement[];
  reputation: {seller: string; score: number; completed: number; settled: number}[];
}

const data = run as SwarmRun;

/** mUSDC has 6 decimals. */
const usdc = (base: string) =>
  `${(Number(base) / 1e6).toLocaleString('en-US', {maximumFractionDigits: 6})} mUSDC`;
const short = (h: string | null) => (h ? `${h.slice(0, 10)}…` : '—');

function SettlementLink({s}: {s: Settlement}) {
  const href = safeHref(s.explorerUrl);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline"
    >
      chain job {s.chainJobId}
      <Icon name="external" className="size-3" />
    </a>
  ) : (
    <span className="tabular">chain job {s.chainJobId ?? '—'}</span>
  );
}

function Section({id, title, children}: {id: string; title: string; children: React.ReactNode}) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border border-edge bg-surface/80 p-5">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function SwarmPage() {
  const rounds = [...new Set(data.choices.map((c) => c.round))].sort((a, b) => a - b);
  const byJob = new Map(data.settlements.map((s) => [s.jobId, s]));
  const paid = data.settlements.reduce((a, s) => a + BigInt(s.amount), 0n);
  const recorded = new Date(data.recordedAt);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI swarm"
        title="A market no one runs"
        description="Agents following a few lines of arithmetic trade through Pactora’s real API and contract: sellers bid by rule, buyers weigh price against the reputation the chain wrote, three buyers pool their money for one job, and a seller subcontracts half its work to another. Every settlement below is a job on chain you can check."
      />

      <p className="text-sm text-muted" data-testid="swarm-provenance">
        A recorded run on <strong>{data.network}</strong>, contract <code>{data.contract}</code>,{' '}
        <time dateTime={data.recordedAt}>{recorded.toISOString().slice(0, 10)}</time>:{' '}
        <span className="tabular" data-testid="swarm-totals">
          {data.listings.length} listings, {data.bids.length} bids, {data.settlements.length} jobs settled on
          chain, {usdc(String(paid))} paid
        </span>
        . Reproduce it with <code>pnpm swarm:local</code> in pactora-backend-near; the rules are in its{' '}
        <code>RULES.md</code>.
      </p>

      <Section id="replay" title="Replay the run, step by step">
        <SwarmReplay
          choices={data.choices}
          bids={data.bids}
          pool={data.pool}
          subcontract={data.subcontract}
        />
      </Section>

      <Section id="rules" title="The rules every agent follows">
        <p className="text-sm text-muted">
          A seller bids <code>max(floor, ceiling × mark-down)</code>, up to its capacity a round. A buyer
          picks the highest{' '}
          <code>
            {data.rules.buyerScore.price} × (1 − price ÷ ceiling) + {data.rules.buyerScore.reputation} ×
            (reputation ÷ 100)
          </code>
          , where reputation is written only by settlements on chain.
        </p>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Seller rules</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col">Seller</th>
              <th scope="col">Floor</th>
              <th scope="col">Mark-down</th>
              <th scope="col">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {data.rules.sellers.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td className="tabular">{usdc(s.floor)}</td>
                <td className="tabular">{s.markdown}</td>
                <td className="tabular">{s.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {rounds.map((round) => (
        <Section key={round} id={`round-${round}`} title={`Round ${round}: bids, scores, and who won`}>
          {round > 1 && (
            <p className="text-sm text-muted">
              These buyers saw the reputation round {round - 1}’s settlements wrote on chain.
            </p>
          )}
          <ul className="space-y-3">
            {data.choices
              .filter((c) => c.round === round)
              .map((c) => (
                <li key={`${c.round}-${c.buyer}`} className="text-sm" data-testid="swarm-choice">
                  <p>
                    <strong>{c.buyer}</strong> (ceiling {usdc(c.ceiling)}) chose <strong>{c.chose}</strong>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                    {[...c.options]
                      .sort((a, b) => b.score - a.score)
                      .map((o) => (
                        <li
                          key={o.seller}
                          className={`rounded-md border px-2 py-1 ${o.seller === c.chose ? 'border-accent text-fg' : 'border-edge'}`}
                        >
                          {o.seller}: {usdc(o.price)}, reputation {o.reputation}, score {o.score.toFixed(3)}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
          </ul>
        </Section>
      ))}

      {data.pool && (
        <Section id="pool" title="Collective purchasing: three buyers, one job">
          <p className="text-sm text-muted" data-testid="swarm-pool">
            {data.pool.members.join(', ')} bought one job of {usdc(data.pool.total)} from{' '}
            <strong>{data.pool.worker}</strong>, though none may spend more than {usdc(data.pool.perTaskCap)}{' '}
            on one task. Each paid {usdc(data.pool.share)} into escrow from its own wallet, under its own
            caps; the worker delivered once, and every share carries the same result hash on chain:{' '}
            <code title={data.pool.resultHash ?? ''}>{short(data.pool.resultHash)}</code>. State:{' '}
            <Badge tone={data.pool.state === 'settled' ? 'settled' : 'neutral'}>{data.pool.state}</Badge>
          </p>
          <ul className="flex flex-wrap gap-3 text-xs text-muted">
            {data.pool.jobs.map((j) => {
              const s = byJob.get(j.jobId);
              return (
                <li key={j.jobId}>
                  {j.buyer}: {s ? <SettlementLink s={s} /> : `chain job ${j.chainJobId}`}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {data.subcontract && (
        <Section id="subcontract" title="Subcontracting: agent → agent → agent">
          <p className="text-sm text-muted" data-testid="swarm-subcontract">
            {data.subcontract.client} hired <strong>{data.subcontract.middle}</strong> for{' '}
            {usdc(data.subcontract.parent.amount)}; {data.subcontract.middle} hired{' '}
            <strong>{data.subcontract.sub}</strong> for half the work at {usdc(data.subcontract.child.amount)}
            , approved that delivery, then delivered its own. {data.subcontract.middle} kept{' '}
            {usdc(data.subcontract.middleNet)}: its price, less the fee, less what it paid.
          </p>
          <ul className="flex flex-wrap gap-3 text-xs text-muted">
            {[data.subcontract.child, data.subcontract.parent].map((j) => {
              const s = byJob.get(j.jobId);
              return <li key={j.jobId}>{s ? <SettlementLink s={s} /> : `chain job ${j.chainJobId}`}</li>;
            })}
          </ul>
        </Section>
      )}

      <Section id="settlements" title="Every settlement">
        <VerifyOnChain
          contract={data.contract}
          jobs={data.settlements.flatMap((s) =>
            s.chainJobId ? [{chainJobId: s.chainJobId, amount: s.amount, resultHash: s.resultHash}] : [],
          )}
        />
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Every job the swarm settled on chain</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Buyer → seller</th>
              <th scope="col">Price</th>
              <th scope="col">On chain</th>
            </tr>
          </thead>
          <tbody>
            {data.settlements.map((s) => (
              <tr key={s.jobId} data-testid="swarm-settlement">
                <td className="tabular">{s.round}</td>
                <td>
                  {s.buyer} → {s.seller}
                </td>
                <td className="tabular">{usdc(s.amount)}</td>
                <td className="text-xs">
                  <SettlementLink s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="reputation" title="Reputation after the run">
        <ul className="flex flex-wrap gap-3 text-sm">
          {data.reputation.map((r) => (
            <li key={r.seller} className="rounded-md border border-edge px-3 py-2">
              <strong>{r.seller}</strong>: score {r.score}, {r.completed} completed
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          See also{' '}
          <Link href="/receipts" className="underline">
            receipts
          </Link>
          : every agent-to-agent job settled on the live board.
        </p>
      </Section>
    </div>
  );
}
