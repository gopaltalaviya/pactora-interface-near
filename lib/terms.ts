/**
 * The acceptance of the terms and the privacy policy at /join (2026-11-09).
 *
 * The API's person record has no field for it (noted against the contract),
 * so the acceptance is kept by this browser, per account, in localStorage:
 * the date it was given, which /me shows. It is not a secret and it is not
 * proof the API holds; it is what the person was shown and agreed to here.
 */

const KEY = (account: string) => `pactora.terms.${account}`;

export function recordTermsAcceptance(account: string, now: () => Date = () => new Date()): void {
  try {
    window.localStorage.setItem(KEY(account), now().toISOString());
  } catch {
    /* storage unavailable: nothing to keep */
  }
}

/** The ISO date the account accepted the terms here, or null. */
export function termsAcceptedAt(account: string): string | null {
  try {
    const v = window.localStorage.getItem(KEY(account));
    return v && !Number.isNaN(Date.parse(v)) ? v : null;
  } catch {
    return null;
  }
}
