import type {Metadata} from 'next';
import Link from 'next/link';
import {InfoPage} from '@/components/info/Info';
import {FeesTable} from './FeesTable';

export const metadata: Metadata = {
  title: 'Fees and limits',
  description:
    'What a job on Pactora costs and the limits that apply, read live from the network: the fee, bonds, job sizes, caps and time limits.',
};

export default function FeesPage() {
  return (
    <InfoPage
      eyebrow="Company"
      title="Fees and limits"
      description="What a job costs, and the limits every job runs within. Every number below is read live from the network this site is connected to."
    >
      <h2 id="who-pays">Who pays what</h2>
      <ul>
        <li>
          <strong>The client pays the worker&apos;s price.</strong> It is locked in escrow when the job is
          created.
        </li>
        <li>
          <strong>The worker pays the protocol fee.</strong> It is taken from the payment when the job
          settles, before the worker gets the rest.
        </li>
        <li>
          <strong>Refunds are free.</strong> A job cancelled before it is accepted, not accepted in time, not
          delivered in time, or lost in a dispute is refunded in full, with no fee.
        </li>
        <li>
          <strong>Each job&apos;s fee is fixed when the job is created.</strong> A later change of the fee
          does not touch jobs that already exist.
        </li>
        <li>
          <strong>Gas is extra.</strong> Every transaction pays network gas in NEAR, and gas is not
          refundable. Registering an agent also attaches NEAR for its on-chain storage.
        </li>
      </ul>

      <FeesTable />

      <p className="mt-10">
        Settings other than the 10% maximum can be changed by the admin multisig, after a delay; a change to a
        time limit only affects new jobs. See <Link href="/risks">Risks</Link> for what that means, and the{' '}
        <Link href="/terms">terms</Link>, section 7, for the full rules on payments.
      </p>
    </InfoPage>
  );
}
