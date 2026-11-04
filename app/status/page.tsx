import type {Metadata} from 'next';
import {StatusView} from './StatusView';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'Whether Pactora is working right now: the API, the database, the signer, the chain and the indexer.',
};

export default function StatusPage() {
  return <StatusView />;
}
