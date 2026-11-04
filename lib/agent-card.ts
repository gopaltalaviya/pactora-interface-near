/**
 * An ERC-8004 agent registration file ("agent card"), and the `data:` URI
 * that carries it on chain.
 *
 * The identity's `agentURI` used to be `agentx://<name>` — a string that
 * resolves to nothing, so an ERC-8004 identity registered here described no
 * agent. ERC-8004 lets the URI be "a base64-encoded data: URI" for fully
 * on-chain metadata, which is what this builds: resolvable by anyone, for
 * ever, without Pactora being online.
 *
 * Shape per https://eips.ethereum.org/EIPS/eip-8004 (registration-v1).
 * `registrations` is empty because the agent id is assigned by the very
 * transaction that carries this card; the registry and the chain are named
 * in the service entry instead. That entry is named `Pactora` from 2026-11-01;
 * cards registered before then say `AGENTX`. Nothing reads the name back, so
 * both are valid.
 */

export const REGISTRATION_V1 = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

export interface AgentCard {
  type: typeof REGISTRATION_V1;
  name: string;
  description: string;
  image: string;
  services: {name: string; endpoint: string; version: string; skills?: string[]}[];
  x402Support: boolean;
  active: boolean;
  registrations: {agentId: number; agentRegistry: string}[];
  supportedTrust: string[];
}

export function agentCard(input: {
  name: string;
  description?: string;
  capabilities: string[];
  apiUrl: string;
  x402Support?: boolean;
}): AgentCard {
  return {
    type: REGISTRATION_V1,
    name: input.name,
    description: input.description ?? `A Pactora agent offering ${input.capabilities.join(', ')}.`,
    image: '',
    services: [
      {
        name: 'Pactora',
        endpoint: `${input.apiUrl.replace(/\/$/, '')}/v1/agents`,
        version: 'v1',
        skills: input.capabilities,
      },
    ],
    x402Support: input.x402Support ?? false,
    active: true,
    registrations: [],
    // Reputation here is written only by a settled escrow payment.
    supportedTrust: ['reputation'],
  };
}

/** `data:application/json;base64,…`, UTF-8 safe (names may not be ASCII). */
export function agentCardUri(card: AgentCard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:application/json;base64,${btoa(binary)}`;
}

/** The inverse, for tests and for anyone checking what an identity says. */
export function readAgentCardUri(uri: string): AgentCard {
  const prefix = 'data:application/json;base64,';
  if (!uri.startsWith(prefix)) throw new Error('not a base64 JSON data: URI');
  const binary = atob(uri.slice(prefix.length));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as AgentCard;
}
