/**
 * openai-iztro-agents — build your own Ziwei (Purple Star Astrology) agent.
 *
 * A thin layer on top of the OpenAI Agents SDK (`@openai/agents`). The hosted Iztro
 * models and their astrology tools are exposed as stock models; your own function
 * tools, MCP servers, and human-in-the-loop run locally via the standard SDK `run()`.
 * Conversation memory lives on the server via `ChatSession`.
 *
 * ```ts
 * import { iztroZiweiAgent, ChatSession, tool, run } from 'openai-iztro-agents';
 *
 * const addToCalendar = tool({ name: 'add_to_calendar', description: '…',
 *   parameters: z.object({ date: z.string(), title: z.string() }),
 *   execute: async ({ date, title }) => `Added '${title}' on ${date}` });
 *
 * const agent = iztroZiweiAgent({ tools: [addToCalendar], apiKey: 'sk_ziwei_...' });
 * const session = new ChatSession({ externalUserId: 'user_42' });
 * const result = await run(agent, 'Per my chart, add a good day to my calendar', { session });
 * console.log(result.finalOutput);
 * ```
 */

// Re-export the SDK essentials so callers can import everything from one place.
export { Agent, Runner, run, tool } from '@openai/agents';

export { iztroQimenAgent, iztroZiweiAgent } from './agent.js';
export type { IztroQimenAgentOptions, IztroZiweiAgentOptions } from './agent.js';
export {
  DEFAULT_BASE_URL,
  IZTRO_QIMEN_MODEL,
  IZTRO_ZIWEI_MODEL,
  IZTRO_TOOLS_EVENT_TYPE,
  TOOL_EVENT_TYPE,
  IztroZiweiModel,
  iztroQimenModel,
  iztroZiweiModel,
  isIztroToolEvent,
  isIztroToolsStreamEvent,
} from './model.js';
export type {
  IztroZiweiModelOptions,
  IztroModelResponse,
  IztroToolEvent,
  IztroToolsStreamEvent,
} from './model.js';
export { ChatSession, listUserConversations } from './session.js';
export type {
  ChatSessionOptions,
  ForkChatSessionOptions,
  ListUserConversationsOptions,
} from './session.js';
