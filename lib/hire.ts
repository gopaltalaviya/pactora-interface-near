/**
 * A person hires an agent directly (POST /v1/jobs/hire, 2026-11-10): the
 * form's checks, the same in kind as a bid's (lib/listing-form.ts
 * validateBid): a price parsed with BigInt in token base units, never a
 * float, and a task the API will take. The API checks again; this only keeps
 * a request that can only be refused from being sent.
 */

import {formatUnits} from './api';
import {parseUnits} from './near';

export const TASK_MAX = 2000;

export interface HireContext {
  decimals: number;
  /** The token's symbol, for the messages; optional. */
  symbol?: string;
  /** The network's minJobAmount, base units. */
  minimum: string;
  /** The most one job may hold (maxJobAmount), base units. */
  ceiling: string;
}

const amount = (base: string, ctx: HireContext) =>
  `${formatUnits(base, ctx.decimals)}${ctx.symbol ? ` ${ctx.symbol}` : ''}`;

export function validateHire(
  priceText: string,
  task: string,
  ctx: HireContext,
): {errors: {price?: string; task?: string}; body: {amount: string; task: string} | null} {
  const errors: {price?: string; task?: string} = {};
  const units = parseUnits(priceText, ctx.decimals);
  if (!priceText.trim()) errors.price = 'Enter your price.';
  else if (units === null || /^0+$/.test(units))
    errors.price = `Enter an amount above 0 with at most ${ctx.decimals} decimals.`;
  else if (BigInt(units) < BigInt(ctx.minimum))
    errors.price = `A job holds at least ${amount(ctx.minimum, ctx)}.`;
  else if (BigInt(units) > BigInt(ctx.ceiling))
    errors.price = `A job holds at most ${amount(ctx.ceiling, ctx)}.`;
  const text = task.trim();
  if (!text) errors.task = 'Describe the task.';
  else if (text.length > TASK_MAX) errors.task = `The task is at most ${TASK_MAX} characters.`;
  if (errors.price || errors.task || units === null) return {errors, body: null};
  return {errors, body: {amount: units, task: text}};
}

/**
 * Why an agent cannot be hired now, or null. `hireable` is the chain's
 * `stake_of(..).hireable` — null when it could not be read (the API still checks).
 */
export function hireBlocked(
  agent: {active: boolean; chainAgentId?: string | number | null},
  hireable: boolean | null,
): string | null {
  if (agent.chainAgentId === null || agent.chainAgentId === undefined)
    return 'This agent is not registered on chain yet, so the escrow cannot hold a job for it.';
  if (!agent.active) return 'This agent is not accepting work: its owner paused it.';
  if (hireable === false)
    return 'This agent’s stake is below the network minimum, so the escrow will not hire it until its owner stakes more.';
  return null;
}
