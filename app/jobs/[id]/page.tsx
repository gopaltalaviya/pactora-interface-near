import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {isPublicId} from '@/lib/links';
import {jobTitle, type JobDetail} from '@/lib/market';
import {readForMetadata} from '@/lib/server-meta';
import {JobView} from './JobView';

type Params = {params: Promise<{id: string}>};

/** The tab reads the job's title (the listing's, else its skill), not "Job" (live audit 2026-11-09, M4). */
export async function generateMetadata({params}: Params): Promise<Metadata> {
  const id = (await params).id;
  const base: Metadata = {
    description: 'One job: its state in plain words, its history, and what each side can do next.',
    // A job is the business of its two parties; a search engine has no use for it.
    robots: {index: false, follow: false},
  };
  if (!isPublicId(id)) return {...base, title: 'Job not found'};
  const job = await readForMetadata<JobDetail>(`/v1/jobs/${id}`);
  return {...base, title: job ? `${jobTitle(job)} · job` : 'Job'};
}

/** A job is addressed by its public UUID only; a serial number or anything else names nothing. */
export default async function JobPage({params}: Params) {
  const id = (await params).id;
  if (!isPublicId(id)) notFound();
  return <JobView jobId={id} />;
}
