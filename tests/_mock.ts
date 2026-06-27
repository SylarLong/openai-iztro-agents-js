/**
 * Offline mock backends for the hosted Ziwei model and the conversation store.
 *
 * These helpers let the whole suite run deterministically, offline, and with no API key
 * by stubbing the global `fetch` (which both the OpenAI client and `ChatSession` use).
 * Two routers:
 *
 *  - `mockChat(...)` — fake the `/v2/chat/completions` endpoint. Build assistant turns
 *    with `assistantText(...)`, `assistantToolCalls(...)`, and `sseStream(...)`.
 *  - `InMemoryConversations` — an in-memory `/v2/platform/conversations` backend that
 *    `ChatSession` / `listUserConversations` talk to.
 *
 * Compose them with `installFetch(...)` and tear down with `vi.unstubAllGlobals()`.
 */

import { vi } from 'vitest';

import { iztroZiweiAgent } from '../src/index.js';
import type { Agent, Tool } from '@openai/agents';

export const TEST_BASE_URL = 'http://ziwei.test';

/** A stock Ziwei agent pointed at the (stubbed) test backend. */
export function agentWith(tools?: Tool[], opts: Record<string, unknown> = {}): Agent {
  return iztroZiweiAgent({
    apiKey: 'sk_ziwei_test',
    baseUrl: TEST_BASE_URL,
    tools,
    ...opts,
  });
}

type FetchArgs = Parameters<typeof fetch>;
type Router = (url: string, init: RequestInit) => Response | undefined;

/** Install a set of routers as the global fetch; first non-undefined wins. */
export function installFetch(...routers: Router[]): void {
  vi.stubGlobal('fetch', async (input: FetchArgs[0], init: FetchArgs[1] = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routers) {
      const resp = route(url, init as RequestInit);
      if (resp) return resp;
    }
    return new Response(JSON.stringify({ error: `unhandled ${init.method ?? 'GET'} ${url}` }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ─────────────────────────── chat-completions (the model) ───────────────────────────

export function assistantText(content: string, id = 'chatcmpl-text'): object {
  return {
    id,
    object: 'chat.completion',
    model: 'iztro-ziwei-v3',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

export function assistantToolCalls(...calls: Array<[string, object]>): object {
  return {
    id: 'chatcmpl-tools',
    object: 'chat.completion',
    model: 'iztro-ziwei-v3',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: calls.map(([name, args], i) => ({
            id: `call_${i}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** A streamed assistant message as Server-Sent Events (one chunk per delta). */
export function sseStream(deltas: string[], finish = 'stop'): Response {
  const chunks = deltas.map((d, i) => ({
    id: 'chatcmpl-stream',
    object: 'chat.completion.chunk',
    model: 'iztro-ziwei-v3',
    choices: [
      {
        index: 0,
        delta: i === 0 ? { role: 'assistant', content: d } : { content: d },
        finish_reason: null,
      },
    ],
  }));
  chunks.push({
    id: 'chatcmpl-stream',
    object: 'chat.completion.chunk',
    model: 'iztro-ziwei-v3',
    choices: [{ index: 0, delta: {} as never, finish_reason: finish as never }],
  });
  const body =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export type ChatResponder = object | Response | ((body: any) => object | Response);

/** A recording `/v2/chat/completions` router built from a sequence of responders. */
export class MockChat {
  requests: any[] = []; // parsed request bodies, in call order
  constructor(private responders: ChatResponder[]) {}

  route: Router = (url, init) => {
    if (!url.includes('/v2/chat/completions') || init.method !== 'POST') return undefined;
    const body = JSON.parse(init.body as string);
    this.requests.push(body);
    const idx = Math.min(this.requests.length - 1, this.responders.length - 1);
    let responder = this.responders[idx];
    if (typeof responder === 'function') responder = (responder as (b: any) => object)(body);
    return responder instanceof Response ? responder : json(responder);
  };

  /** Tool names offered to the model on each request (assert iztro stays hidden). */
  get advertisedTools(): string[][] {
    return this.requests.map((b) => (b.tools ?? []).map((t: any) => t.function.name));
  }
}

export function mockChat(...responders: ChatResponder[]): MockChat {
  return new MockChat(responders);
}

// ─────────────────────────── conversations (the memory store) ───────────────────────

/** A minimal in-memory stand-in for the `/v2/platform/conversations` API. */
export class InMemoryConversations {
  store: Record<string, any[]> = {};
  owners: Record<string, string | undefined> = {};
  authSeen = new Set<string>();
  counter = 0;

  route: Router = (url, init) => {
    const u = new URL(url);
    if (!u.pathname.includes('/v2/platform/')) return undefined;
    this.authSeen.add((init.headers as Record<string, string>)?.Authorization ?? '');
    const method = init.method ?? 'GET';
    const parts = u.pathname.split('/').filter(Boolean); // v2, platform, ...

    // POST /v2/platform/conversations → create (server assigns id)
    if (u.pathname.endsWith('/platform/conversations') && method === 'POST') {
      this.counter += 1;
      const cid = `conv_${this.counter}`;
      const body = init.body ? JSON.parse(init.body as string) : {};
      this.store[cid] = [];
      this.owners[cid] = body.external_user_id;
      return json({ conversation_id: cid });
    }

    // GET /v2/platform/users/{uid}/conversations → list a user's chats
    if (parts.includes('users') && u.pathname.endsWith('/conversations') && method === 'GET') {
      const uid = parts[parts.indexOf('users') + 1];
      const items = Object.entries(this.owners)
        .filter(([, o]) => o === uid)
        .map(([c]) => ({ conversation_id: c }))
        .reverse();
      return json({ items });
    }

    // …/conversations/{cid}/items[...]
    if (u.pathname.includes('/items')) {
      const cid = parts[parts.indexOf('conversations') + 1];
      if (!(cid in this.store)) return json({ error: 'no such conversation' });
      if (u.pathname.endsWith('/items/last') && method === 'DELETE') {
        const item = this.store[cid].pop() ?? null;
        return json({ item });
      }
      if (method === 'GET') return json({ items: [...this.store[cid]] });
      if (method === 'POST') {
        this.store[cid].push(...JSON.parse(init.body as string).items);
        return json({ ok: true });
      }
    }

    // DELETE /v2/platform/conversations/{cid} → clear
    if (parts.includes('conversations') && method === 'DELETE') {
      const cid = parts[parts.indexOf('conversations') + 1];
      delete this.store[cid];
      delete this.owners[cid];
      return json({ ok: true });
    }

    return undefined;
  };
}
