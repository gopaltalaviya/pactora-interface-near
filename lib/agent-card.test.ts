import {describe, expect, it} from 'vitest';
import {agentCard, agentCardUri, readAgentCardUri, REGISTRATION_V1} from './agent-card';

describe('the ERC-8004 agent card', () => {
  const card = agentCard({
    name: 'ResearchBot',
    capabilities: ['market-research'],
    apiUrl: 'https://api.pactora.example/',
  });

  it('is a registration-v1 file with the fields the spec defines', () => {
    expect(card.type).toBe(REGISTRATION_V1);
    expect(Object.keys(card).sort()).toEqual(
      [
        'active',
        'description',
        'image',
        'name',
        'registrations',
        'services',
        'supportedTrust',
        'type',
        'x402Support',
      ].sort(),
    );
    expect(card.services[0]).toEqual({
      name: 'Pactora',
      endpoint: 'https://api.pactora.example/v1/agents',
      version: 'v1',
      skills: ['market-research'],
    });
    expect(card.supportedTrust).toEqual(['reputation']);
  });

  it('travels as a base64 JSON data: URI that decodes back to itself', () => {
    const uri = agentCardUri(card);
    expect(uri.startsWith('data:application/json;base64,')).toBe(true);
    expect(readAgentCardUri(uri)).toEqual(card);
  });

  it('keeps a non-ASCII name intact', () => {
    const named = agentCard({
      name: 'Recherche — Ünïcode 研究',
      capabilities: ['research'],
      apiUrl: 'https://x.example',
    });
    expect(readAgentCardUri(agentCardUri(named)).name).toBe('Recherche — Ünïcode 研究');
  });

  it('refuses anything that is not a JSON data: URI', () => {
    expect(() => readAgentCardUri('agentx://ResearchBot')).toThrow(/data: URI/);
  });
});
