'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {ActionFeedback, errorText, usePersonAction, useNetwork} from '@/components/market/hooks';
import {Button, ButtonLink} from '@/components/ui/Button';
import {Card} from '@/components/ui/Card';
import {Field, Select, TextArea, TextInput} from '@/components/ui/Field';
import {Notice} from '@/components/ui/States';
import {NotReady} from '@/components/market/Readiness';
import {MoneyPanel, useMoney} from '@/components/money/MoneyPanel';
import {SpendSummary} from '@/components/money/SpendSummary';
import {formatUnits, type AgentSummary} from '@/lib/api';
import {spendSummary} from '@/lib/fees';
import {hireBlocked, spendBlocked, TASK_MAX, validateHire} from '@/lib/hire';
import {parseUnits} from '@/lib/near';
import {classifyFailure, keyForSend, newKeyState, type KeyState} from '@/lib/listing-form';
import {market, type Hired} from '@/lib/market';
import {useSession} from '@/lib/session';
import {signInHref} from '@/lib/signin-next';

/**
 * "Hire this agent", for a signed-in person (2026-11-10): a task, a skill,
 * a price prefilled from the agent's own and checked like a bid; then POST
 * /v1/jobs/hire, and the person's wallet signs create_job — the same funding
 * a person does after selecting a bid (ListingView), with the same guard on
 * what the wallet is asked to sign (lib/person-action.ts).
 *
 * Signed out: a way to sign in. No person record: a way to join. An agent
 * that cannot be hired: the form, disabled, with the reason. The page leaves
 * the card out for the agent's own owner.
 */

const hireLimits = (
  token: {minJobAmount: string | undefined; maxJobAmount: string | undefined},
  decimals: number,
  symbol: string,
) => ({
  decimals,
  symbol,
  minimum: token.minJobAmount ?? '1',
  ceiling: token.maxJobAmount ?? '340282366920938463463374607431768211455',
});

const fresh = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `hire-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function HireCard({agent, hireable}: {agent: AgentSummary; hireable: boolean | null}) {
  const session = useSession();
  const token = useNetwork();
  const decimals = token?.decimals ?? 6;
  const symbol = token?.symbol ?? '';
  const [task, setTask] = useState('');
  const [capability, setCapability] = useState(agent.capabilities[0] ?? '');
  const [price, setPrice] = useState(() => formatUnits(agent.pricePerTask, decimals));
  const [errors, setErrors] = useState<{price?: string; task?: string}>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hired, setHired] = useState<Hired | null>(null);
  const keyRef = useRef<KeyState | null>(null);
  const action = usePersonAction();

  // The prefill follows the token's decimals once the network is known.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current && token) setPrice(formatUnits(agent.pricePerTask, token.decimals));
  }, [token, agent.pricePerTask]);

  const path = `/agents/${agent.agentId}`;
  const blocked = hireBlocked(agent, hireable);

  // The person's own purse, read before anything is created: a hire the purse cannot fund is not offered.
  const money = useMoney(token?.network ?? null, {
    account: session.status === 'in' ? session.account : null,
    chainAgentId: session.person?.chainAgentId ?? null,
  });
  const record = money.record?.ok ? money.record.value : null;
  // Only a price the form itself accepts is checked against the purse: a malformed or
  // out-of-range one is the form's to explain when Hire is pressed.
  const limits = token ? hireLimits(token, decimals, symbol) : null;
  const typed = parseUnits(price, decimals);
  const priced = typed && limits && !validateHire(price, 'x', limits).errors.price ? typed : null;
  const amountForCheck = hired?.job?.amount ?? priced;
  const moneyBlock =
    token && amountForCheck
      ? spendBlocked(amountForCheck, record?.purse ?? null, record?.storage ?? null, {
          decimals,
          symbol,
          chainAgentId: session.person?.chainAgentId ?? null,
          testnet: token.network.testnet,
        })
      : null;

  async function hire() {
    if (!token) return;
    const checked = validateHire(price, task, hireLimits(token, decimals, symbol));
    setErrors(checked.errors);
    setProblem(null);
    if (!checked.body) return;
    const body = {
      workerAgentId: String(agent.agentId),
      amount: checked.body.amount,
      task: checked.body.task,
      ...(capability ? {capability} : {}),
    };
    // One key per draft: a retry of the same hire is a replay, never a second job.
    const state = keyForSend(keyRef.current ?? newKeyState(fresh), JSON.stringify(body), fresh);
    keyRef.current = state;
    setBusy(true);
    try {
      const r = await session.authed((t) => market.hire(t, {...body, idempotencyKey: state.key}));
      setHired(r);
    } catch (err) {
      keyRef.current = {...state, outcome: classifyFailure(err)};
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const description = `Pay ${agent.name} for one task, held in escrow until you approve the result.`;

  if (session.status === 'loading') return null;
  if (session.status === 'out') {
    return (
      <Card title="Hire this agent" labelledBy="hire" description={description}>
        <p className="text-sm">
          <Link href={signInHref(path)} className="text-accent underline">
            Sign in to hire
          </Link>
          <span className="text-muted"> — one signature, no transaction.</span>
        </p>
      </Card>
    );
  }
  // The person record is unknown (the API failed): the session banner says so; no join prompt.
  if (!session.person && session.personError) return null;
  if (!session.person) {
    return (
      <Card title="Hire this agent" labelledBy="hire" description={description}>
        <p className="text-sm">
          Hiring needs a person record: it is the on-chain identity that pays.{' '}
          <Link href="/join" className="text-accent underline">
            Join as a person
          </Link>
          .
        </p>
      </Card>
    );
  }

  const funding = hired?.funding;
  const job = hired?.job;
  const mustSign = funding?.by === 'person' && !funding.done && job && !action.state.done;

  return (
    <Card title="Hire this agent" labelledBy="hire" description={description}>
      {!hired ? (
        <form
          className="space-y-3 text-sm"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void hire();
          }}
        >
          {blocked && (
            <p className="text-sm text-refused" data-testid="hire-blocked">
              {blocked}
            </p>
          )}
          <Field label="What should the agent do?" htmlFor="hire-task" error={errors.task ?? null}>
            <TextArea
              id="hire-task"
              value={task}
              maxLength={TASK_MAX}
              rows={4}
              disabled={blocked !== null}
              onChange={(e) => setTask(e.target.value)}
              aria-invalid={errors.task ? true : undefined}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {agent.capabilities.length > 0 && (
              <Field label="Skill" htmlFor="hire-skill">
                <Select
                  id="hire-skill"
                  value={capability}
                  disabled={blocked !== null}
                  onChange={(e) => setCapability(e.target.value)}
                >
                  {agent.capabilities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label={`Price${symbol ? ` (${symbol})` : ''}`}
              htmlFor="hire-price"
              error={errors.price ?? null}
              hint={`Its asking price is ${agent.priceDisplay}; you may offer another.`}
            >
              <TextInput
                id="hire-price"
                mono
                inputMode="decimal"
                value={price}
                disabled={blocked !== null}
                onChange={(e) => {
                  touched.current = true;
                  setPrice(e.target.value);
                }}
                autoComplete="off"
              />
            </Field>
          </div>
          {token && priced && blocked === null && <SpendSummary rows={spendSummary(priced, token.network)} />}
          <MoneyPanel
            network={token?.network ?? null}
            money={money}
            account={session.account}
            chainAgentId={session.person.chainAgentId}
            compact
            only={['purse', 'daily', 'storage', 'near']}
            id="hire-money"
          />
          {blocked === null && moneyBlock && <NotReady readiness={moneyBlock} testId="hire-money-blocked" />}
          <Button
            type="submit"
            size="sm"
            loading={busy}
            disabled={busy || blocked !== null || !token || moneyBlock !== null}
          >
            Hire
          </Button>
          <p className="text-xs text-muted">
            Hiring creates the job; your wallet then signs one transaction that puts the money in escrow.
          </p>
          {problem && (
            <p role="alert" className="text-xs text-broken">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          {mustSign && job && (
            <>
              <p className="text-muted">
                The job is created, but not on chain yet. Signing creates it and puts {job.amountDisplay} in
                escrow.
                {funding?.signerId ? ` Your wallet must sign as ${funding.signerId}.` : ''}
              </p>
              <p className="text-xs text-muted" data-testid="will-sign-create">
                You will sign: create_job on {token?.network.contracts.Pactora ?? 'the Pactora contract'}:{' '}
                {job.amountDisplay} into escrow.
              </p>
              {moneyBlock && <NotReady readiness={moneyBlock} testId="hire-money-blocked" />}
              <Button
                size="sm"
                loading={action.state.busy}
                disabled={action.state.busy || action.state.pending !== null || moneyBlock !== null}
                onClick={() =>
                  void action.run(job.jobId, 'create', {}, {chainJobId: null, amount: job.amount})
                }
              >
                Sign and fund the job
              </Button>
              <ActionFeedback state={action.state} recheck={() => void action.recheck()} />
            </>
          )}
          {(action.state.done || !mustSign) && job && (
            <Notice tone="live">
              <p role="status" data-testid="hire-funded">
                {action.state.done || funding?.done
                  ? 'Funded. The job is on chain and the money is in escrow.'
                  : 'Hired.'}{' '}
                The agent has its accept window to take it; if it does not, the money comes back.
              </p>
            </Notice>
          )}
          {job && (
            <ButtonLink href={`/jobs/${job.jobId}`} size="sm" variant="secondary">
              Open the job
            </ButtonLink>
          )}
        </div>
      )}
    </Card>
  );
}
