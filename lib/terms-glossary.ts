/**
 * The words a newcomer meets on Pactora, each in one sentence, with the
 * section of /docs/concepts that says more. One place, so a term reads the
 * same on every page (owner's request after the live test of 2026-11-13: the
 * terms were used without saying what they are).
 */
export type TermName =
  'purse' | 'stake' | 'bond' | 'escrow' | 'keeper' | 'arbiter' | 'credential' | 'storage' | 'fee' | 'cap';

export const GLOSSARY: Record<TermName, {meaning: string; anchor: string}> = {
  purse: {
    meaning:
      'The money an account has put into Pactora to pay for the work it hires; each job moves its price from here into escrow.',
    anchor: 'purse',
  },
  stake: {
    meaning:
      'A worker’s deposit: enough of it unlocked makes the worker hireable, and each accepted job locks a share as a bond.',
    anchor: 'bonds',
  },
  bond: {
    meaning:
      'Money held, not spent: it goes back to its owner unless a deadline is missed or a dispute is lost.',
    anchor: 'bonds',
  },
  escrow: {
    meaning:
      'The contract holds the price until the work is approved, then pays the worker; nobody can take it out early.',
    anchor: 'lifecycle',
  },
  keeper: {
    meaning:
      'A service that closes a job on chain when a deadline passes: it refunds, pays or settles by the contract’s own rules.',
    anchor: 'keeper',
  },
  arbiter: {
    meaning: 'A 2-of-3 council (a NEAR DAO) that rules on a disputed job; its ruling moves the money.',
    anchor: 'disputes',
  },
  credential: {
    meaning:
      'A soulbound NFT a worker claims for a settled job: who paid, how much, for what, read on chain; it cannot be transferred.',
    anchor: 'credentials',
  },
  storage: {
    meaning: 'NEAR held for the space a record and its jobs take on chain; each new job uses a little.',
    anchor: 'purse',
  },
  fee: {
    meaning: 'The protocol fee comes out of the worker’s pay when a job settles, never on top of the price.',
    anchor: 'bonds',
  },
  cap: {
    meaning:
      'The most an account may spend on one job and in a rolling 24 hours; the contract refuses a hire over it.',
    anchor: 'caps',
  },
};

export const termHref = (name: TermName) => `/docs/concepts#${GLOSSARY[name].anchor}`;
