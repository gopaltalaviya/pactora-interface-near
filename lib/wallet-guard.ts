import type {FunctionCallPayload, PersonAction} from './market';

/**
 * The allow-list between the API and the wallet.
 *
 * `prepare` (a person's action) and the admin desk's `propose`/`vote` answer
 * with the exact FunctionCall to sign. The page used to sign whatever came
 * back, so a compromised API — or a bug in it — could have asked the wallet
 * for a token transfer to anyone, with the person's own click as consent.
 *
 * Before the wallet opens, the call is held against what the page already
 * knows: the contracts the network publishes, the one method each action
 * means, the job the page is showing, and the deposit a call may carry
 * (nothing, or the one yocto a NEP-141 call needs). Anything else is refused
 * with the reason, and nothing is signed.
 */

export interface Contracts {
  Pactora: string;
  PaymentToken: string;
  Arbiter: string;
}

/** What the page knows about the job the action is for. Unknown fields are not checked. */
export interface ExpectedJob {
  /** The job's id on chain; `null` while it is not on chain yet (a `create`). */
  chainJobId?: string | null;
  /** The job's amount in base units, for a funding (`create`). */
  amount?: string;
}

/**
 * The methods each action may be. `cancel` differs between the API and its
 * mock (`cancel` vs `cancel_job`); `create` is either the escrow's own
 * `create_job` (paid from the agent's purse) or a token transfer into it.
 */
export const PERSON_METHODS: Record<PersonAction, readonly string[]> = {
  create: ['create_job', 'ft_transfer_call'],
  accept: ['accept_job'],
  submit: ['submit_result'],
  approve: ['approve'],
  dispute: ['dispute'],
  cancel: ['cancel', 'cancel_job'],
  // A decline is recorded off chain (2026-11-09 §3): no call may ever be signed for it.
  decline: [],
};

/** The most a DAO call may attach: the proposal bond (0.1 NEAR on the testnet DAO), with room. */
const MAX_DAO_DEPOSIT = 10n ** 24n; // 1 NEAR

export class UnexpectedCall extends Error {
  constructor(
    readonly call: FunctionCallPayload,
    readonly reason: string,
  ) {
    super(
      `Pactora asked the wallet to sign something unexpected (${call.methodName} on ${call.receiverId}): ${reason}. ` +
        'Nothing was signed and nothing was sent: the request was refused. Reload the page; if it happens again, report it.',
    );
    this.name = 'UnexpectedCall';
  }
}

const isYoctoDeposit = (deposit: string, allowed: readonly string[]) => allowed.includes(deposit);

function idText(v: unknown): string | null {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint' ? String(v) : null;
}

/** Throws `UnexpectedCall` unless `call` is the one `action` on this job may sign. */
export function checkPersonCall(
  call: FunctionCallPayload,
  action: PersonAction,
  contracts: Contracts,
  expected: ExpectedJob = {},
): void {
  // Typed explicitly, so TypeScript narrows after each call (a `never` return).
  const refuse: (reason: string) => never = (reason) => {
    throw new UnexpectedCall(call, reason);
  };
  const methods = PERSON_METHODS[action];
  if (!methods.includes(call.methodName)) refuse(`a ${action} signs ${methods.join(' or ')}`);

  const transfer = call.methodName === 'ft_transfer_call';
  const wanted = transfer ? contracts.PaymentToken : contracts.Pactora;
  if (!wanted || call.receiverId !== wanted)
    refuse(`the call should go to ${wanted || 'the Pactora contract'}`);

  if (!isYoctoDeposit(call.deposit, transfer ? ['1'] : ['0', '1']))
    refuse(`it attaches a deposit of ${call.deposit || 'nothing'} yoctoNEAR`);

  const args = call.args ?? {};
  if (expected.chainJobId) {
    const id = idText(args['job_id']);
    if (id === null) refuse(`it names no job, and this is job ${expected.chainJobId}`);
    if (id !== expected.chainJobId) refuse(`it is for job ${id}, and this is job ${expected.chainJobId}`);
  }

  if (action === 'create') {
    if (transfer) {
      if (args['receiver_id'] !== contracts.Pactora) refuse('the money would not go into the Pactora escrow');
      if (expected.amount === undefined) refuse('the page cannot check the amount');
    }
    const amount = idText(args['amount']);
    if (expected.amount !== undefined && amount !== null && amount !== expected.amount)
      refuse(`it moves ${amount}, and the job is ${expected.amount}`);
  }
}

export type DaoExpectation =
  | {kind: 'propose'; dao: string | null; contracts: Contracts}
  | {
      kind: 'vote';
      dao: string | null;
      contracts: Contracts;
      proposalId: number;
      action: 'VoteApprove' | 'VoteReject';
    };

/** Throws `UnexpectedCall` unless `call` is the DAO proposal or vote the member asked for. */
export function checkDaoCall(call: FunctionCallPayload, expect: DaoExpectation): void {
  // Typed explicitly, so TypeScript narrows after each call (a `never` return).
  const refuse: (reason: string) => never = (reason) => {
    throw new UnexpectedCall(call, reason);
  };
  const daos = [expect.dao, expect.contracts.Arbiter].filter((d): d is string => Boolean(d));
  if (!daos.includes(call.receiverId)) refuse(`the call should go to the arbiter DAO (${daos.join(' or ')})`);

  const deposit = /^\d+$/.test(call.deposit) ? BigInt(call.deposit) : null;
  const args = call.args ?? {};
  if (expect.kind === 'vote') {
    if (call.methodName !== 'act_proposal') refuse('a vote is act_proposal');
    if (deposit !== 0n) refuse(`a vote attaches nothing, not ${call.deposit}`);
    if (idText(args['id']) !== String(expect.proposalId))
      refuse(`it votes on proposal ${idText(args['id'])}`);
    if (args['action'] !== expect.action) refuse(`it would ${String(args['action'])}, not ${expect.action}`);
    return;
  }
  if (call.methodName !== 'add_proposal') refuse('a ruling is add_proposal');
  if (deposit === null || deposit > MAX_DAO_DEPOSIT)
    refuse(`it attaches ${call.deposit || 'an unreadable deposit'}`);
  const proposal = args['proposal'] as {kind?: Record<string, {receiver_id?: unknown}>} | undefined;
  const fc = proposal?.kind?.['FunctionCall'];
  if (!fc) refuse('a ruling is a FunctionCall proposal');
  if (fc.receiver_id !== expect.contracts.Pactora) refuse('the ruling would not call the Pactora contract');
}
