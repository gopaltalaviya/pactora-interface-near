import {describe, expect, it} from 'vitest';
import type {FunctionCallPayload} from './market';
import {checkDaoCall, checkPersonCall, UnexpectedCall} from './wallet-guard';

/**
 * The API builds the FunctionCall a person signs. The page trusts the API for
 * what to sign only within an allow-list: a known contract, the method that
 * belongs to the action, the job it was opened for, and no deposit beyond the
 * one yocto NEAR a token call needs. Anything else is refused before the
 * wallet opens, because a signature cannot be taken back.
 */

const contracts = {
  Pactora: 'pactora.testnet',
  PaymentToken: 'musdc.pactora.testnet',
  Arbiter: 'arbiter.pactora.testnet',
};
const call = (over: Partial<FunctionCallPayload> = {}): FunctionCallPayload => ({
  receiverId: 'pactora.testnet',
  methodName: 'approve',
  args: {job_id: 5, review_hash: null},
  gas: '100000000000000',
  deposit: '0',
  ...over,
});
const onChain = {chainJobId: '5'};

describe('checkPersonCall', () => {
  it('accepts the expected call for each action', () => {
    expect(() => checkPersonCall(call(), 'approve', contracts, onChain)).not.toThrow();
    expect(() =>
      checkPersonCall(call({methodName: 'accept_job', args: {job_id: '5'}}), 'accept', contracts, onChain),
    ).not.toThrow();
    expect(() =>
      checkPersonCall(
        call({methodName: 'submit_result', args: {job_id: 5, result_hash: 'ab'}}),
        'submit',
        contracts,
        onChain,
      ),
    ).not.toThrow();
    expect(() =>
      checkPersonCall(
        call({methodName: 'dispute', args: {job_id: 5, reason_hash: 'cd'}}),
        'dispute',
        contracts,
        onChain,
      ),
    ).not.toThrow();
    // The backend's cancel is `cancel`; the mock's is `cancel_job`. Both refund this job.
    expect(() =>
      checkPersonCall(call({methodName: 'cancel', args: {job_id: 5}}), 'cancel', contracts, onChain),
    ).not.toThrow();
    expect(() =>
      checkPersonCall(call({methodName: 'cancel_job', args: {job_id: 5}}), 'cancel', contracts, onChain),
    ).not.toThrow();
    // A job not on chain yet: create_job on Pactora, for the job's amount.
    expect(() =>
      checkPersonCall(
        call({
          methodName: 'create_job',
          args: {client_id: 1, worker_id: 2, amount: '4000000', spec_hash: 'x'},
        }),
        'create',
        contracts,
        {chainJobId: null, amount: '4000000'},
      ),
    ).not.toThrow();
    // Or a token transfer into escrow, for exactly the amount, with the one yocto a token call needs.
    expect(() =>
      checkPersonCall(
        call({
          receiverId: 'musdc.pactora.testnet',
          methodName: 'ft_transfer_call',
          args: {receiver_id: 'pactora.testnet', amount: '4000000', msg: '{}'},
          deposit: '1',
        }),
        'create',
        contracts,
        {amount: '4000000'},
      ),
    ).not.toThrow();
  });

  it('refuses a receiver that is not a Pactora contract', () => {
    expect(() => checkPersonCall(call({receiverId: 'attacker.testnet'}), 'approve', contracts)).toThrow(
      UnexpectedCall,
    );
    // The token contract is known, but an approve never goes there.
    expect(() => checkPersonCall(call({receiverId: 'musdc.pactora.testnet'}), 'approve', contracts)).toThrow(
      UnexpectedCall,
    );
  });

  it('refuses a method that is not the action’s', () => {
    expect(() => checkPersonCall(call({methodName: 'ft_transfer'}), 'approve', contracts)).toThrow(
      UnexpectedCall,
    );
    expect(() => checkPersonCall(call({methodName: 'approve'}), 'dispute', contracts)).toThrow(
      UnexpectedCall,
    );
    expect(() => checkPersonCall(call({methodName: 'add_full_access_key'}), 'cancel', contracts)).toThrow(
      UnexpectedCall,
    );
  });

  it('refuses another job’s id, and a missing one once the job is on chain', () => {
    expect(() => checkPersonCall(call({args: {job_id: 6}}), 'approve', contracts, onChain)).toThrow(/job 5/);
    expect(() => checkPersonCall(call({args: {review_hash: null}}), 'approve', contracts, onChain)).toThrow(
      UnexpectedCall,
    );
    // Not known yet (the page has no chain id): the id cannot be checked, the rest still is.
    expect(() => checkPersonCall(call({args: {job_id: 6}}), 'approve', contracts, {})).not.toThrow();
  });

  it('refuses a deposit beyond one yocto, and a funding amount that is not the job’s', () => {
    expect(() => checkPersonCall(call({deposit: '2'}), 'approve', contracts)).toThrow(UnexpectedCall);
    expect(() => checkPersonCall(call({deposit: '1000000000000000000000000'}), 'approve', contracts)).toThrow(
      UnexpectedCall,
    );
    expect(() => checkPersonCall(call({deposit: ''}), 'approve', contracts)).toThrow(UnexpectedCall);
    const transfer = (amount: string, to = 'pactora.testnet') =>
      call({
        receiverId: 'musdc.pactora.testnet',
        methodName: 'ft_transfer_call',
        args: {receiver_id: to, amount, msg: '{}'},
        deposit: '1',
      });
    expect(() => checkPersonCall(transfer('4000001'), 'create', contracts, {amount: '4000000'})).toThrow(
      /4000000/,
    );
    // A transfer whose amount the page cannot check is refused, not waved through.
    expect(() => checkPersonCall(transfer('4000000'), 'create', contracts, {})).toThrow(UnexpectedCall);
    // A transfer that does not land in escrow.
    expect(() =>
      checkPersonCall(transfer('4000000', 'attacker.testnet'), 'create', contracts, {amount: '4000000'}),
    ).toThrow(UnexpectedCall);
    expect(() =>
      checkPersonCall(call({methodName: 'create_job', args: {amount: '9'}}), 'create', contracts, {
        amount: '4000000',
      }),
    ).toThrow(/4000000/);
  });

  it('says what was refused, in words a person can act on', () => {
    expect(() => checkPersonCall(call({receiverId: 'attacker.testnet'}), 'approve', contracts)).toThrow(
      /Pactora asked the wallet to sign something unexpected \(approve on attacker\.testnet\).*refused/s,
    );
  });
});

describe('checkDaoCall', () => {
  const dao = 'pactora-arbiter.sputnikv2.testnet';
  const voting = {kind: 'vote', dao, contracts, proposalId: 3, action: 'VoteApprove'} as const;
  const proposing = {kind: 'propose', dao, contracts} as const;
  const vote = (over: Partial<FunctionCallPayload> = {}): FunctionCallPayload => ({
    receiverId: dao,
    methodName: 'act_proposal',
    args: {id: 3, action: 'VoteApprove'},
    gas: '300000000000000',
    deposit: '0',
    ...over,
  });
  const propose = (over: Partial<FunctionCallPayload> = {}): FunctionCallPayload => ({
    receiverId: dao,
    methodName: 'add_proposal',
    args: {
      proposal: {description: 'job', kind: {FunctionCall: {receiver_id: 'pactora.testnet', actions: []}}},
    },
    gas: '100000000000000',
    deposit: '100000000000000000000000',
    ...over,
  });

  it('accepts a vote on the named proposal and a proposal with the DAO bond', () => {
    expect(() => checkDaoCall(vote(), voting)).not.toThrow();
    expect(() => checkDaoCall(propose(), proposing)).not.toThrow();
    // The DAO may also be the network's arbiter account.
    expect(() =>
      checkDaoCall(propose({receiverId: 'arbiter.pactora.testnet'}), {kind: 'propose', dao: null, contracts}),
    ).not.toThrow();
  });

  it('refuses another receiver, method, proposal or vote, and a deposit beyond the bond', () => {
    expect(() => checkDaoCall(vote({receiverId: 'attacker.testnet'}), voting)).toThrow(UnexpectedCall);
    expect(() => checkDaoCall(vote({methodName: 'add_proposal'}), voting)).toThrow(UnexpectedCall);
    expect(() => checkDaoCall(vote({args: {id: 4, action: 'VoteApprove'}}), voting)).toThrow(UnexpectedCall);
    expect(() => checkDaoCall(vote({args: {id: 3, action: 'VoteReject'}}), voting)).toThrow(UnexpectedCall);
    expect(() => checkDaoCall(vote({deposit: '1000'}), voting)).toThrow(UnexpectedCall);
    expect(() => checkDaoCall(propose({deposit: '2000000000000000000000000'}), proposing)).toThrow(
      UnexpectedCall,
    );
    // A proposal that is not a call on the Pactora contract (a transfer to someone).
    expect(() =>
      checkDaoCall(
        propose({args: {proposal: {kind: {Transfer: {receiver_id: 'attacker.testnet'}}}}}),
        proposing,
      ),
    ).toThrow(UnexpectedCall);
    expect(() =>
      checkDaoCall(
        propose({args: {proposal: {kind: {FunctionCall: {receiver_id: 'attacker.testnet', actions: []}}}}}),
        proposing,
      ),
    ).toThrow(UnexpectedCall);
  });
});
