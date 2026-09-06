/** Thin factory that returns a stock OpenAI Agents SDK `Agent` wired to Ziwei. */

import { Agent } from '@openai/agents';
import type { Tool } from '@openai/agents';

import {
  IZTRO_HYBRID_MODEL,
  IZTRO_QIMEN_FAST_MODEL,
  IZTRO_QIMEN_MODEL,
  IZTRO_ZIWEI_FAST_MODEL,
  IZTRO_ZIWEI_MODEL,
  iztroHybridModel,
  iztroQimenFastModel,
  iztroQimenModel,
  iztroZiweiFastModel,
  iztroZiweiModel,
} from './model.js';

export interface IztroZiweiAgentOptions {
  name?: string;
  instructions?: string;
  /** Local function tools (define with `tool(...)`). They run in this process. */
  tools?: Tool[];
  /** `agents` MCP servers; their tools run locally. */
  mcpServers?: unknown[];
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  /** Any other stock `Agent` config (e.g. `modelSettings`, `toolUseBehavior`). */
  [key: string]: unknown;
}

export type IztroQimenAgentOptions = IztroZiweiAgentOptions;
export type IztroHybridAgentOptions = IztroZiweiAgentOptions;
export type IztroZiweiFastAgentOptions = IztroZiweiAgentOptions;
export type IztroQimenFastAgentOptions = IztroZiweiAgentOptions;

/**
 * Return a stock `Agent` whose model is the hosted Ziwei agent.
 *
 * Use it with the normal SDK: `run(agent, '…', { session: new ChatSession(...) })`.
 * Developer `tools` (define with `tool(...)`) and `mcpServers` run locally; the iztro
 * chart tools stay hidden on the server. Human-in-the-loop and tool-call modes are
 * native SDK features (`needsApproval`, `modelSettings.toolChoice`).
 *
 * ```ts
 * import { tool, run } from '@openai/agents';
 * import { iztroZiweiAgent, ChatSession } from 'openai-iztro-agents';
 *
 * const agent = iztroZiweiAgent({ tools: [addToCalendar], apiKey: KEY });
 * const session = new ChatSession({ externalUserId: 'user_42' });
 * const result = await run(agent, '…', { session });
 * ```
 */
export function iztroZiweiAgent(options: IztroZiweiAgentOptions = {}): Agent {
  const {
    name = 'Ziwei',
    instructions,
    tools,
    mcpServers,
    apiKey,
    baseUrl,
    modelName = IZTRO_ZIWEI_MODEL,
    ...rest
  } = options;

  return new Agent({
    name,
    ...(instructions !== undefined ? { instructions } : {}),
    model: iztroZiweiModel({ apiKey, baseUrl, model: modelName }),
    tools: (tools ?? []) as Tool[],
    mcpServers: (mcpServers ?? []) as never,
    ...rest,
  });
}

/**
 * Return a stock `Agent` whose model is the hosted Qimen agent.
 *
 * The Qimen model handles one concrete matter from the question time and needs no
 * birth details. Pin a user's local question time with
 * `modelSettings.providerData.metadata.current_datetime`.
 *
 * Public calculation names returned by the API are available through `toolEvent` /
 * `iztroTools` and `IztroToolEvent`. Developer tools and MCP servers use the standard
 * OpenAI Agents SDK interfaces.
 */
export function iztroQimenAgent(options: IztroQimenAgentOptions = {}): Agent {
  const {
    name = 'Qimen',
    instructions,
    tools,
    mcpServers,
    apiKey,
    baseUrl,
    modelName = IZTRO_QIMEN_MODEL,
    ...rest
  } = options;

  return new Agent({
    name,
    ...(instructions !== undefined ? { instructions } : {}),
    model: iztroQimenModel({ apiKey, baseUrl, model: modelName }),
    tools: (tools ?? []) as Tool[],
    mcpServers: (mcpServers ?? []) as never,
    ...rest,
  });
}

/** Return a stock Agent backed by the faster, lower-token, lower-cost Ziwei model. */
export function iztroZiweiFastAgent(options: IztroZiweiFastAgentOptions = {}): Agent {
  const {
    name = 'Ziwei Fast',
    instructions,
    tools,
    mcpServers,
    apiKey,
    baseUrl,
    modelName = IZTRO_ZIWEI_FAST_MODEL,
    ...rest
  } = options;

  return new Agent({
    name,
    ...(instructions !== undefined ? { instructions } : {}),
    model: iztroZiweiFastModel({ apiKey, baseUrl, model: modelName }),
    tools: (tools ?? []) as Tool[],
    mcpServers: (mcpServers ?? []) as never,
    ...rest,
  });
}

/** Return a stock Agent backed by the faster, lower-token, lower-cost Qimen model. */
export function iztroQimenFastAgent(options: IztroQimenFastAgentOptions = {}): Agent {
  const {
    name = 'Qimen Fast',
    instructions,
    tools,
    mcpServers,
    apiKey,
    baseUrl,
    modelName = IZTRO_QIMEN_FAST_MODEL,
    ...rest
  } = options;

  return new Agent({
    name,
    ...(instructions !== undefined ? { instructions } : {}),
    model: iztroQimenFastModel({ apiKey, baseUrl, model: modelName }),
    tools: (tools ?? []) as Tool[],
    mcpServers: (mcpServers ?? []) as never,
    ...rest,
  });
}

/** Return a stock `Agent` backed by the callable hosted hybrid model. */
export function iztroHybridAgent(options: IztroHybridAgentOptions = {}): Agent {
  const {
    name = 'Ziwei + Qimen',
    instructions,
    tools,
    mcpServers,
    apiKey,
    baseUrl,
    modelName = IZTRO_HYBRID_MODEL,
    ...rest
  } = options;

  return new Agent({
    name,
    ...(instructions !== undefined ? { instructions } : {}),
    model: iztroHybridModel({ apiKey, baseUrl, model: modelName }),
    tools: (tools ?? []) as Tool[],
    mcpServers: (mcpServers ?? []) as never,
    ...rest,
  });
}
