/**
 * ChatSession — server-side conversation memory for the OpenAI Agents SDK.
 *
 * A `Session` implementation backed by the hosted Iztro conversation store, modeled on
 * the SDK's own `OpenAIConversationsSession`: the **server generates the conversation
 * id** (lazily, on first use), and `externalUserId` records which of *your* users owns
 * it (so you can list/manage a user's chats). Pair it with the stock model pointed at
 * `/v2/chat/completions`:
 *
 * ```ts
 * import { Agent, run } from '@openai/agents';
 * import { iztroZiweiModel, ChatSession } from 'openai-iztro-agents';
 *
 * const agent = new Agent({ name: 'Ziwei', model: iztroZiweiModel({ apiKey: KEY }), tools: [...] });
 *
 * // New conversation owned by your user (server assigns the id):
 * const session = new ChatSession({ externalUserId: 'user_42' });   // ZIWEI_API_KEY from env
 * await run(agent, 'What city is the Golden Gate Bridge in?', { session });
 * await run(agent, 'What state is it in?', { session });            // remembers
 * const savedId = session.sessionId;   // persist to resume later
 *
 * // Resume an existing conversation:
 * const resumed = new ChatSession({ conversationId: savedId });
 * ```
 *
 * List a user's conversations for management: `await listUserConversations('user_42')`.
 */

import type { AgentInputItem, Session } from '@openai/agents';

export const DEFAULT_BASE_URL = 'https://chat-api.iztro.com';

function resolve(apiKey?: string, baseUrl?: string): { apiKey: string; base: string } {
  const key = apiKey ?? process.env.ZIWEI_API_KEY;
  if (!key) {
    throw new Error('apiKey is required (pass apiKey or set ZIWEI_API_KEY)');
  }
  const base = (baseUrl ?? process.env.ZIWEI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiKey: key, base };
}

export interface ChatSessionOptions {
  /** Resume an existing conversation by id (skips lazy creation). */
  conversationId?: string;
  /** Which of *your* users owns a newly created conversation. */
  externalUserId?: string;
  apiKey?: string;
  baseUrl?: string;
  /** Per-request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
}

/**
 * Server-side conversation history with a server-generated id.
 *
 * The conversation is created lazily on the first session operation. Reading
 * `sessionId` before then throws (mirrors `OpenAIConversationsSession`).
 */
export class ChatSession implements Session {
  externalUserId?: string;

  #apiKey: string;
  #base: string;
  #conversationId?: string;
  #timeoutMs: number;

  constructor(options: ChatSessionOptions = {}) {
    const { apiKey, base } = resolve(options.apiKey, options.baseUrl);
    this.#apiKey = apiKey;
    this.#base = base;
    this.#conversationId = options.conversationId;
    this.externalUserId = options.externalUserId;
    this.#timeoutMs = options.timeoutMs ?? 30000;
  }

  /** The server-generated id. Throws until the conversation has been created. */
  get sessionId(): string {
    if (!this.#conversationId) {
      throw new Error(
        'Conversation id not yet available. It is created lazily on the first session ' +
          'operation — call getItems()/addItems() (or run the agent) first.',
      );
    }
    return this.#conversationId;
  }

  set sessionId(value: string) {
    this.#conversationId = value;
  }

  async #request(method: string, url: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.#apiKey}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(`${method} ${url} -> ${resp.status} ${await resp.text()}`);
    }
    return resp;
  }

  async #ensureConversationId(): Promise<string> {
    if (!this.#conversationId) {
      const body = this.externalUserId ? { external_user_id: this.externalUserId } : {};
      const resp = await this.#request('POST', `${this.#base}/v2/platform/conversations`, body);
      this.#conversationId = ((await resp.json()) as { conversation_id: string }).conversation_id;
    }
    return this.#conversationId;
  }

  #itemsUrl(suffix = ''): string {
    return `${this.#base}/v2/platform/conversations/${this.#conversationId}/items${suffix}`;
  }

  /** Ensure (creating if needed) and return the conversation id — `Session` API. */
  async getSessionId(): Promise<string> {
    return this.#ensureConversationId();
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    await this.#ensureConversationId();
    const url = new URL(this.#itemsUrl());
    if (limit) url.searchParams.set('limit', String(limit));
    const resp = await this.#request('GET', url.toString());
    return ((await resp.json()) as { items?: AgentInputItem[] }).items ?? [];
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (!items.length) return;
    await this.#ensureConversationId();
    await this.#request('POST', this.#itemsUrl(), { items });
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    await this.#ensureConversationId();
    const resp = await this.#request('DELETE', this.#itemsUrl('/last'));
    return ((await resp.json()) as { item?: AgentInputItem }).item ?? undefined;
  }

  async clearSession(): Promise<void> {
    await this.#ensureConversationId();
    await this.#request(
      'DELETE',
      `${this.#base}/v2/platform/conversations/${this.#conversationId}`,
    );
    this.#conversationId = undefined;
  }

  /** No-op; kept for parity with the Python client (`fetch` needs no teardown). */
  async close(): Promise<void> {}
}

export interface ListUserConversationsOptions {
  apiKey?: string;
  baseUrl?: string;
  limit?: number;
}

/** List the conversations owned by one of your users (most recent first). */
export async function listUserConversations(
  externalUserId: string,
  options: ListUserConversationsOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const { apiKey, base } = resolve(options.apiKey, options.baseUrl);
  const url = new URL(`${base}/v2/platform/users/${externalUserId}/conversations`);
  url.searchParams.set('limit', String(options.limit ?? 50));
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    throw new Error(`GET ${url} -> ${resp.status} ${await resp.text()}`);
  }
  return ((await resp.json()) as { items?: Array<Record<string, unknown>> }).items ?? [];
}
