/**
 * NEAR account ids and amounts, the way this site checks and shows them.
 *
 * No library: the rule is one regex (nearcore's), and amounts are decimal
 * strings handled as BigInt, never floats.
 */

/** nearcore's account-id rule; length is checked separately (2–64). */
const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/** One segment of an account id: what an agent name may be before `.<owner>`. */
const SEGMENT = /^([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT = /^[0-9a-f]{64}$/;

export const MAX_ACCOUNT_ID = 64;

export function isAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= MAX_ACCOUNT_ID && ACCOUNT_ID.test(id);
}

/**
 * The agent's own account, `<name>.<owner>`. Only the owner can create it,
 * which is what ties the two together on chain. Throws with a sentence a
 * person can act on.
 */
export function subAccount(name: string, owner: string): string {
  if (!SEGMENT.test(name)) {
    throw new Error('Use lowercase letters, digits, - and _ only (no dots), e.g. research-bot.');
  }
  const id = `${name}.${owner}`;
  if (id.length > MAX_ACCOUNT_ID) {
    throw new Error(
      `${id.length} characters: a NEAR account id is 64 at most. Use a shorter name${
        IMPLICIT.test(owner) ? ', or an owner with a named account (an implicit account leaves no room)' : ''
      }.`,
    );
  }
  if (!isAccountId(id)) throw new Error(`${id} is not a valid NEAR account id.`);
  return id;
}

/**
 * How an account is shown. Named accounts are what people read and check, so
 * they are never cut; only a 64-hex implicit account, which nobody reads in
 * full, is shortened in the middle.
 */
export function displayAccount(id: string): string {
  return IMPLICIT.test(id) ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
}

export const YOCTO_DECIMALS = 24;

/** yoctoNEAR → NEAR, at most four decimals, rounded down (a balance never reads higher than it is). */
export function formatYocto(yocto: string, places = 4): string {
  const digits = yocto.replace(/^0+/, '').padStart(YOCTO_DECIMALS + 1, '0');
  const whole = digits.slice(0, -YOCTO_DECIMALS);
  const fraction = digits.slice(-YOCTO_DECIMALS, -YOCTO_DECIMALS + places).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
