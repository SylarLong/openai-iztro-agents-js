# Examples — start here

Small, runnable programs that show what the Ziwei (Purple Star Astrology / 紫微斗数) agent
can do. They go from the **simplest** to the **more advanced** — work through them in order.
You do **not** need to be an experienced developer; each file is heavily commented.

## 1. One-time setup

**a) Install Node 18 or newer.** Check: `node --version`

**b) Install the package:**

```bash
npm install openai-iztro-agents
```

(The examples in this folder import from `../src` for local development. In your own app,
import from `openai-iztro-agents` instead.)

**c) Get an API key** (it looks like `sk_ziwei_...`) from the developer console.

## 2. Run an example

The examples read your key from the `ZIWEI_API_KEY` environment variable and run with
[`tsx`](https://www.npmjs.com/package/tsx):

```bash
# macOS / Linux:
ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/01-hello-ziwei.ts

# Windows (PowerShell):
$env:ZIWEI_API_KEY="sk_ziwei_..."; npx tsx examples/01-hello-ziwei.ts
```

The reading prints to your screen.

## 3. The examples, simplest first

| File | What it teaches | Key idea |
|---|---|---|
| `01-hello-ziwei.ts` | Your first program: one rich, professional, chart-grounded reading. | the basics |
| `02-prompt-gallery.ts` | **The showcase** — the same chart read for personality, fortune (流年运势), career, love, and wealth. Copy any prompt. | depth & variety |
| `03-streaming-chat.ts` | Show the reply as it's typed, live. | `run(agent, …, { stream: true })` |
| `04-memory-and-resume.ts` | Remember a conversation and **resume it later** (save the id, reload it next request). | `ChatSession` |
| `05-basic-local-tool.ts` | Let the agent call **one** of your functions. | `tool(...)` |
| `06-two-tools-at-once.ts` | The agent calls **two** of your functions in one turn. | parallel tools |
| `07-multi-step-booking.ts` | A two-step task: check your calendar, then book a free day. | tools used in sequence |
| `08-human-in-the-loop.ts` | Make the agent **ask your permission** before a sensitive action (e.g. sending email). | `needsApproval: true` |
| `09-limit-length-and-cost.ts` | Cap output size to bound **cost** in production (not a quality setting). | `modelSettings: { maxTokens }` |
| `10-chinese-chat.ts` | Do everything in Chinese (中文全程对话). | unicode end-to-end |
| `11-agent-as-tool.ts` | Use the Ziwei agent as **one tool** inside your own GPT agent. | agents-as-tools |
| `fullstack-demo/` | The same React chat workbench backed by this JS SDK: list, rename, delete, fork, edit, charts, Markdown, and streaming. | production integration shape |

## A few words you'll see

- **The chart is automatic.** The agent reads and summarizes the Purple Star chart for you,
  on the server. You never write a tool to compute or summarize the chart — your tools are
  only for **your** world (calendar, email, notes, your own data).
- **Agent** — the Ziwei "brain" you talk to. You build it with `iztroZiweiAgent({...})`.
- **Tool** — one of *your* functions the agent is allowed to call. You define it with
  `tool(...)`. Your tools run locally in this process.
- **run** — the thing that actually runs a turn: `run(agent, 'your question')`.
- **Depth is the point.** Let the agent answer fully — the rich, chart-grounded reading is
  what makes this different from a generic chatbot. Shape *what* it covers and its tone in
  the `instructions` (see `02-prompt-gallery.ts`), not by forcing it short.
- **modelSettings** — knobs for the model. `maxTokens` is a hard ceiling on reply length
  for **cost control in production** (see `09-limit-length-and-cost.ts`) — a budget limit,
  not a quality setting.
- **ChatSession** — optional memory, so the agent remembers earlier messages. History lives
  on the server under a conversation id; **save `session.sessionId`** to resume the chat
  later (see `04-memory-and-resume.ts`). `listUserConversations(userId)` lists a user's chats.

## If something goes wrong

- **`apiKey is required`** → you didn't set `ZIWEI_API_KEY` and didn't paste a key.
- **`Cannot find module '../src/index.js'`** → run from the project root, after `npm install`.

Each example is self-contained — copy one, change the question, and you have your own app.
