# openai-iztro-agents (JavaScript / TypeScript)

Build your own **Ziwei (Purple Star Astrology / 紫微斗数) agent** in TypeScript.

> `npm install openai-iztro-agents` → `import { iztroZiweiAgent } from 'openai-iztro-agents'`
>
> 🐍 **Prefer Python?** See the sibling package [**openai-iztro-agents** (Python)](https://github.com/a5507203/openai-iztro-agents-python) — same design, Pythonic API.

A thin layer on top of the [OpenAI Agents SDK for JS/TS](https://github.com/openai/openai-agents-js) (`@openai/agents`):

- The **hosted Ziwei agent and its iztro chart tools** run on the server (hidden) — exposed as a stock SDK model.
- **Your own function tools, MCP servers, and human-in-the-loop** run locally via the standard `run()`.
- **Conversation memory** lives on the server via `ChatSession` (the OpenAI Conversations–style session).

You write ordinary OpenAI Agents SDK code — `Agent`, `run`, `tool`, `@openai/agents` MCP servers, `modelSettings.toolChoice`, `needsApproval` — and point the model at Ziwei. This is the JS twin of the Python [`openai-iztro-agents`](https://pypi.org/project/openai-iztro-agents/): same design, different language.

## Install

```bash
npm install openai-iztro-agents
```

Get an API key (`sk_ziwei_*`) from the developer console.

## Quickstart

```ts
import { z } from 'zod';
import { run } from '@openai/agents';
import { iztroZiweiAgent, ChatSession, tool } from 'openai-iztro-agents';

const addToCalendar = tool({
  name: 'add_to_calendar',
  description: "Add an event to the user's calendar. Runs locally.",
  parameters: z.object({ date: z.string(), title: z.string() }),
  execute: async ({ date, title }) => `Added '${title}' on ${date}`,
});

const agent = iztroZiweiAgent({ tools: [addToCalendar], apiKey: 'sk_ziwei_...' });
const session = new ChatSession({ externalUserId: 'user_42' });
const result = await run(
  agent,
  'I was born 1990-06-15 at 10am, male. Pick a good day next week and add it to my calendar.',
  { session },
);
console.log(result.finalOutput);
```

`iztroZiweiAgent(...)` returns a **stock `Agent`** whose model is the hosted Ziwei agent — so everything from the OpenAI Agents SDK works unchanged (`result.newItems`, streaming via `run(agent, input, { stream: true })`, handoffs, tracing, …).

## Conversation memory & resume (ChatSession)

History is stored on the server with a **server-generated id**, owned by your `externalUserId`:

```ts
import { ChatSession, listUserConversations } from 'openai-iztro-agents';

const session = new ChatSession({ externalUserId: 'user_42' }); // ZIWEI_API_KEY from env
await run(agent, 'My name is Alice.', { session });
await run(agent, "What's my name?", { session }); // remembers

const convId = session.sessionId;          // save to resume later
new ChatSession({ conversationId: convId }); // resume

// Manage a user's chats:
await listUserConversations('user_42');
```

`sessionId` precedence: explicit `conversationId` > a server-assigned id created lazily on first use. Reading `sessionId` before the conversation exists throws.

## Tool-call modes

Your tools use the SDK's native controls; the iztro tools are hidden:

```ts
const agent = iztroZiweiAgent({
  tools: [...],
  modelSettings: { toolChoice: 'auto', parallelToolCalls: true },
});
```

## Human-in-the-loop (native SDK)

```ts
const sendEmail = tool({
  name: 'send_email', description: '…',
  parameters: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  needsApproval: true,
  execute: async ({ to }) => `sent to ${to}`,
});

let result = await run(agent, '…');
while (result.interruptions.length) {        // SDK pauses before the tool runs
  for (const item of result.interruptions) {
    result.state.approve(item);              // or result.state.reject(item)
  }
  result = await run(agent, result.state);
}
```

## MCP servers

```ts
import { MCPServerStdio } from '@openai/agents';
const weather = new MCPServerStdio({ command: 'uvx', args: ['mcp-server-weather'] });
const agent = iztroZiweiAgent({ mcpServers: [weather], apiKey: KEY });
```

## API

| Export | Mirrors the Python | Notes |
|---|---|---|
| `iztroZiweiAgent(opts)` | `iztro_ziwei_agent(...)` | stock `Agent`, hosted model |
| `iztroZiweiModel(opts)` | `iztro_ziwei_model(...)` | stock `OpenAIChatCompletionsModel` |
| `ChatSession` | `ChatSession` | server-side memory (`Session`) |
| `listUserConversations(id, opts)` | `list_user_conversations(...)` | list a user's chats |
| `DEFAULT_BASE_URL`, `IZTRO_ZIWEI_MODEL` | same | constants |
| re-exports: `Agent`, `Runner`, `run`, `tool` | `Agent`, `Runner`, `function_tool` | from `@openai/agents` |

Options use `camelCase` (`apiKey`, `baseUrl`, `externalUserId`, `modelName`) — the JS convention — where Python uses `snake_case`.

## Testing

```bash
# Fast, deterministic, offline (no key) — stubs the model + conversation HTTP:
npm test            # vitest; the live test self-skips

# Live end-to-end against a deployed backend (opt-in):
ZIWEI_API_KEY=sk_ziwei_... npx vitest run tests/live.test.ts
# defaults to dev; prod via ZIWEI_BASE_URL=https://chat-api.iztro.com
```

The offline suite covers a wide range of scenarios (each can graduate into an `examples/` script):

| File | What it exercises |
|---|---|
| `tests/toolLoops.test.ts` | plain chat, single/parallel/sequential tool calls, typed args, local-tool errors, unicode, `toolChoice`/`parallelToolCalls`, and that iztro tools stay hidden |
| `tests/humanInTheLoop.test.ts` | native `needsApproval` — approve, reject, mixed approve+reject |
| `tests/streaming.test.ts` | streamed text deltas reassembling into `finalOutput` |
| `tests/session.test.ts` | `ChatSession` memory — lazy id, add/get/pop/clear, multi-turn, ownership + listing, resume |
| `tests/factories.test.ts` | credential/base-url resolution, `/v2` suffix, SDK arg passthrough |

Shared offline backends live in `tests/_mock.ts` (a stubbed chat-completions endpoint and an in-memory conversation store).

## Notes

- Birth details are gathered by the Ziwei agent through the conversation — there is no `birthInfo` parameter.
- The backend currently streams an answer as a single chunk (not token-by-token); streaming works but token-level streaming is a future backend enhancement.
- Streaming together with developer tools is not yet supported — use non-streaming `run` for tool loops.
- Multi-turn tool loops re-send the prompt each round, so they cost more tokens.
