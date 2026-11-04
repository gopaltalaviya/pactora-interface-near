import {describe, expect, it} from 'vitest';
import {reviewOf} from './review';

/**
 * Whether a settled job's on-chain review was written. The escrow writes the
 * review in the same transaction that pays the worker, and emits
 * FeedbackFailed if the registry refused it — payment never waits on
 * reputation. So the proof is the payment's own transaction, unless that
 * event is present.
 */
const ev = (kind: string, explorerUrl: string | null = `https://testnet.monadexplorer.com/tx/0x${kind}`) => ({
  kind,
  explorerUrl,
});

describe('reviewOf', () => {
  it('points at the settlement transaction when the escrow paid and reviewed', () => {
    expect(reviewOf({events: [ev('created'), ev('accepted'), ev('submitted'), ev('settled')]})).toEqual({
      written: true,
      explorerUrl: 'https://testnet.monadexplorer.com/tx/0xsettled',
    });
  });

  it('counts a fast-path payment, which reviews in the same call', () => {
    expect(reviewOf({events: [ev('created'), ev('direct_paid')]})).toEqual({
      written: true,
      explorerUrl: 'https://testnet.monadexplorer.com/tx/0xdirect_paid',
    });
  });

  it('says so when the registry refused the review', () => {
    expect(reviewOf({events: [ev('settled'), ev('feedback_failed')]})).toEqual({written: false});
  });

  it('claims nothing before the payment is indexed', () => {
    expect(reviewOf({events: [ev('created'), ev('submitted')]})).toBeNull();
  });

  it('claims nothing for a refund or a dispute', () => {
    expect(reviewOf({events: [ev('created'), ev('refunded')]})).toBeNull();
    expect(reviewOf({events: [ev('disputed'), ev('dispute_resolved')]})).toBeNull();
  });

  it('drops a link that is not a known explorer', () => {
    expect(reviewOf({events: [ev('settled', 'javascript:alert(1)')]})).toEqual({
      written: true,
      explorerUrl: null,
    });
  });
});
