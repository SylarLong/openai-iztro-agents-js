/** Thin factory that returns a stock OpenAI Agents SDK `Agent` wired to Ziwei. */

import { Agent } from '@openai/agents';
import type { Tool } from '@openai/agents';

import { IZTRO_ZIWEI_MODEL, iztroZiweiModel } from './model.js';

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
