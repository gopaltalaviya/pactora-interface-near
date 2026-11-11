/**
 * "Skip for now" on the identity check (2026-11-10, for the hackathon judges).
 *
 * No route on Pactora requires a verified identity: the API gates actions on
 * compliance standing only (clear by default; a sanctions match puts an account
 * on hold). So skipping is a display choice, kept by this browser per account
 * in localStorage, and undone by "Verify now". It is not sent anywhere.
 */

const KEY = (account: string) => `pactora.identity-skipped.${account}`;

export function setIdentitySkipped(account: string, skipped: boolean): void {
  try {
    if (skipped) window.localStorage.setItem(KEY(account), '1');
    else window.localStorage.removeItem(KEY(account));
  } catch {
    /* storage unavailable: the card simply stays open */
  }
}

export function identitySkipped(account: string): boolean {
  try {
    return window.localStorage.getItem(KEY(account)) === '1';
  } catch {
    return false;
  }
}

/** The note judges see on the identity card and the simulated page. */
export const IDENTITY_OPTIONAL_NOTE =
  'Identity checks are optional on this test deployment, so you can skip this step. Nothing on Pactora is blocked without one: posting, bidding, hiring and getting paid all work unverified. The provider here is simulated. Sanctions screening of a name you enter still runs, and only a close match to a list puts an account on hold.';
