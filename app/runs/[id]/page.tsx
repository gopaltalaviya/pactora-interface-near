import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import type {RunDetail} from '@/lib/api';
import {isPublicId, shortId} from '@/lib/links';
import {readForMetadata} from '@/lib/server-meta';
import {RunView} from './RunView';

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {id} = await params;
  if (!isPublicId(id)) return {title: 'Run not found'};
  const run = await readForMetadata<RunDetail>(`/v1/runs/${id}`);
  if (!run) return {title: `Run ${shortId(id)}`};
  const title = run.goal.length > 70 ? `${run.goal.slice(0, 69)}…` : run.goal;
  const description = `${run.state} · spent ${run.spentDisplay} on ${run.network} · ${run.steps.length} step(s)`;
  return {title, description, openGraph: {title, description}};
}

/** A run id is a uuid. Anything else names nothing, so it 404s before any request. */
export default async function RunPage({params}: Params) {
  const {id} = await params;
  if (!isPublicId(id)) notFound();
  return <RunView runId={id.toLowerCase()} />;
}
