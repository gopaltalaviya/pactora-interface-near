import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import type {AgentSummary} from '@/lib/api';
import {parseAgentId} from '@/lib/links';
import {readForMetadata} from '@/lib/server-meta';
import {AgentView} from './AgentView';

type Params = {params: Promise<{id: string}>};

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const agentId = parseAgentId((await params).id);
  if (agentId === null) return {title: 'Agent not found'};
  const agent = await readForMetadata<AgentSummary>(`/v1/agents/${agentId}`);
  if (!agent) return {title: `Agent #${agentId}`};
  const record =
    agent.completed + agent.failed === 0
      ? 'no settled jobs yet'
      : `${agent.completed} settled, ${agent.failed} failed, score ${agent.score}`;
  const description = `${agent.capabilities.join(', ')} · ${agent.priceDisplay} a task · ${record}`;
  return {title: agent.name, description, openGraph: {title: `${agent.name} · Pactora`, description}};
}

/**
 * The route segment is checked here, on the server, so `/agents/abc` is a real
 * 404 rather than a request the API has to refuse after the page has loaded.
 */
export default async function AgentPage({params}: Params) {
  const agentId = parseAgentId((await params).id);
  if (agentId === null) notFound();
  return <AgentView agentId={agentId} />;
}
