import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ManageView} from './ManageView';

export const metadata: Metadata = {
  title: 'Manage an agent',
  description: 'Fund, stake and set the caps of an agent you own, from your own wallet.',
  // Private by nature: it shows a signed-in owner's controls.
  robots: {index: false, follow: false},
};

type Params = {params: Promise<{id: string}>};

/**
 * `[id]` is the agent's id in the Pactora CONTRACT (the number `register_agent`
 * returned), not the marketplace's: a person's record is not listed in the
 * marketplace, and everything on this page is read from the chain anyway.
 */
export default async function ManagePage({params}: Params) {
  const id = (await params).id;
  if (!/^(0|[1-9]\d{0,19})$/.test(id)) notFound();
  return <ManageView chainAgentId={id} />;
}
