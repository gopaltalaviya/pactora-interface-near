/**
 * The agent card a registration carries on chain as `card_uri`, and the
 * `data:` URI that holds it.
 *
 * A `data:` URI so it resolves for anyone, for ever, without Pactora being
 * online. Small on purpose: the Pactora contract refuses a `card_uri` over
 * 512 bytes (`MAX_CARD_URI`, contracts/pactora/src/lib.rs), and refusing it
 * here costs nothing where refusing it on chain costs a failed transaction.
 * The description is the first thing dropped to fit; the full record,
 * description included, lives in the API.
 *
 * Its shape is Pactora's own (`type` below). NEAR has no agent-card standard
 * yet; the fields follow the agent-registration file this project used on
 * Monad (name, services with skills), minus what a 512-byte limit cannot hold.
 */

export const CARD_V1 = 'pactora-agent-card-v1';

/** The contract's limit on `card_uri`, in bytes. */
export const MAX_CARD_URI = 512;

export interface AgentCard {
  type: typeof CARD_V1;
  name: string;
  description?: string;
  services: {name: string; endpoint: string; version: string; skills?: string[]}[];
}

export function agentCard(input: {
  name: string;
  description?: string;
  capabilities: string[];
  apiUrl: string;
}): AgentCard {
  return {
    type: CARD_V1,
    name: input.name,
    ...(input.description ? {description: input.description} : {}),
    services: [
      {
        name: 'Pactora',
        endpoint: `${input.apiUrl.replace(/\/$/, '')}/v1/agents`,
        version: 'v1',
        skills: input.capabilities,
      },
    ],
  };
}

const PREFIX = 'data:application/json;base64,';

function encode(card: AgentCard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `${PREFIX}${btoa(binary)}`;
}

/**
 * `data:application/json;base64,…`, UTF-8 safe (names may not be ASCII), at
 * most 512 bytes: without the description if it must, and an error if even
 * that is too long.
 */
export function agentCardUri(card: AgentCard): string {
  const full = encode(card);
  if (full.length <= MAX_CARD_URI) return full;
  const {description: _dropped, ...bare} = card;
  const short = encode(bare);
  if (short.length <= MAX_CARD_URI) return short;
  throw new Error(
    `The agent card is ${short.length} bytes and the contract takes ${MAX_CARD_URI} at most — use a shorter name or fewer capabilities.`,
  );
}

/** The inverse, for tests and for anyone checking what a registration says. */
export function readAgentCardUri(uri: string): AgentCard {
  if (!uri.startsWith(PREFIX)) throw new Error('not a base64 JSON data: URI');
  const binary = atob(uri.slice(PREFIX.length));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as AgentCard;
}
