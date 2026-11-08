import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isPublicId} from '@/lib/links';
import {JobView} from './JobView';

export const metadata: Metadata = {
  title: 'Job',
  description: 'One job: its state in plain words, its history, and what each side can do next.',
  // A job is the business of its two parties; a search engine has no use for it.
  robots: {index: false, follow: false},
};

type Params = {params: Promise<{id: string}>};

/** A job is addressed by its public UUID only; a serial number or anything else names nothing. */
export default async function JobPage({params}: Params) {
  const id = (await params).id;
  if (!isPublicId(id)) notFound();
  return <JobView jobId={id} />;
}
