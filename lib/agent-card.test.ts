import {describe, expect, it} from 'vitest';
import {agentCard, agentCardUri, CARD_V1, MAX_CARD_URI, readAgentCardUri} from './agent-card';

describe('the agent card', () => {
  const card = agentCard({
    name: 'ResearchBot',
    capabilities: ['market-research'],
    apiUrl: 'https://api.pactora.example/',
  });

  it('is a Pactora card naming where the agent is listed and what it does', () => {
    expect(card.type).toBe(CARD_V1);
    expect(CARD_V1).not.toMatch(/eip|ethereum/i);
    expect(card.services[0]).toEqual({
      name: 'Pactora',
      endpoint: 'https://api.pactora.example/v1/agents',
      version: 'v1',
      skills: ['market-research'],
    });
  });

  it('travels as a base64 JSON data: URI that decodes back to itself', () => {
    const uri = agentCardUri(card);
    expect(uri.startsWith('data:application/json;base64,')).toBe(true);
    expect(readAgentCardUri(uri)).toEqual(card);
  });

  it('fits the contract limit on card_uri (512 bytes)', () => {
    expect(MAX_CARD_URI).toBe(512);
    expect(agentCardUri(card).length).toBeLessThanOrEqual(MAX_CARD_URI);
  });

  it('drops a description that would not fit, rather than sending a call that fails', () => {
    const long = agentCard({
      name: 'ResearchBot',
      description: 'x'.repeat(400),
      capabilities: ['market-research'],
      apiUrl: 'https://api.pactora.example',
    });
    const uri = agentCardUri(long);
    expect(uri.length).toBeLessThanOrEqual(MAX_CARD_URI);
    expect(readAgentCardUri(uri).description).toBeUndefined();
  });

  it('says so when even the bare card is too long', () => {
    const huge = agentCard({
      name: 'ResearchBot',
      capabilities: Array.from({length: 16}, (_, i) => `capability-number-${i}-long`),
      apiUrl: 'https://api.pactora.example',
    });
    expect(() => agentCardUri(huge)).toThrow(/512/);
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
    expect(() => readAgentCardUri('pactora://ResearchBot')).toThrow(/data: URI/);
  });
});
