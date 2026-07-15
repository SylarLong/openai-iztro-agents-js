import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ConversationMetadata {
  conversation_id: string;
  external_user_id: string;
  title: string;
  parent_conversation_id: string | null;
  forked_at_item: number | null;
  last_message: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

interface ChartCall {
  conversation_id: string;
  item_index: number;
  tool_name: string;
  created_at: string;
}

interface StoreState {
  conversations: Record<string, ConversationMetadata>;
  chart_calls: ChartCall[];
}

const now = () => new Date().toISOString();

/** App-owned metadata around the hosted ChatSession message store. */
export class MetadataStore {
  readonly path: string;
  #state: StoreState = { conversations: {}, chart_calls: [] };
  #ready: Promise<void>;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
    this.#ready = this.#load();
  }

  async #load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<StoreState>;
      this.#state = {
        conversations: parsed.conversations ?? {},
        chart_calls: parsed.chart_calls ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async #persist(): Promise<void> {
    const snapshot = JSON.stringify(this.#state, null, 2);
    this.#writeQueue = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, snapshot, 'utf8');
    });
    await this.#writeQueue;
  }

  async ensureConversation(
    conversationId: string,
    externalUserId: string,
    options: {
      title?: string;
      parentConversationId?: string | null;
      forkedAtItem?: number | null;
    } = {},
  ): Promise<ConversationMetadata> {
    await this.#ready;
    const existing = this.#state.conversations[conversationId];
    if (existing) return { ...existing };
    const timestamp = now();
    const metadata: ConversationMetadata = {
      conversation_id: conversationId,
      external_user_id: externalUserId,
      title: options.title || '新会话',
      parent_conversation_id: options.parentConversationId ?? null,
      forked_at_item: options.forkedAtItem ?? null,
      last_message: '',
      item_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.#state.conversations[conversationId] = metadata;
    await this.#persist();
    return { ...metadata };
  }

  async getConversation(conversationId: string): Promise<ConversationMetadata | undefined> {
    await this.#ready;
    const metadata = this.#state.conversations[conversationId];
    return metadata ? { ...metadata } : undefined;
  }

  async listConversations(externalUserId: string): Promise<ConversationMetadata[]> {
    await this.#ready;
    return Object.values(this.#state.conversations)
      .filter((item) => item.external_user_id === externalUserId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((item) => ({ ...item }));
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await this.#ready;
    const metadata = this.#state.conversations[conversationId];
    if (!metadata) return;
    metadata.title = title;
    metadata.updated_at = now();
    await this.#persist();
  }

  async updateActivity(
    conversationId: string,
    options: { lastMessage?: string; itemCount?: number },
  ): Promise<void> {
    await this.#ready;
    const metadata = this.#state.conversations[conversationId];
    if (!metadata) return;
    metadata.updated_at = now();
    if (options.lastMessage !== undefined) metadata.last_message = options.lastMessage;
    if (options.itemCount !== undefined) metadata.item_count = options.itemCount;
    await this.#persist();
  }

  async titleFromFirstMessage(conversationId: string, message: string): Promise<void> {
    await this.#ready;
    const metadata = this.#state.conversations[conversationId];
    if (!metadata || metadata.title !== '新会话') return;
    const compact = message.replace(/\s+/g, ' ').trim();
    if (!compact) return;
    metadata.title = compact.length > 30 ? `${compact.slice(0, 30)}…` : compact;
    metadata.updated_at = now();
    await this.#persist();
  }

  async recordChartCalls(
    conversationId: string,
    itemIndex: number,
    tools: string[],
  ): Promise<void> {
    await this.#ready;
    let changed = false;
    for (const tool of new Set(tools.filter(Boolean))) {
      const exists = this.#state.chart_calls.some(
        (item) =>
          item.conversation_id === conversationId &&
          item.item_index === itemIndex &&
          item.tool_name === tool,
      );
      if (!exists) {
        this.#state.chart_calls.push({
          conversation_id: conversationId,
          item_index: itemIndex,
          tool_name: tool,
          created_at: now(),
        });
        changed = true;
      }
    }
    if (changed) await this.#persist();
  }

  async copyChartCalls(
    sourceId: string,
    targetId: string,
    itemCount?: number,
  ): Promise<void> {
    await this.#ready;
    const source = this.#state.chart_calls.filter(
      (item) =>
        item.conversation_id === sourceId &&
        (itemCount === undefined || item.item_index < itemCount),
    );
    for (const item of source) {
      const exists = this.#state.chart_calls.some(
        (candidate) =>
          candidate.conversation_id === targetId &&
          candidate.item_index === item.item_index &&
          candidate.tool_name === item.tool_name,
      );
      if (!exists) {
        this.#state.chart_calls.push({ ...item, conversation_id: targetId, created_at: now() });
      }
    }
    if (source.length) await this.#persist();
  }

  async chartsByItem(conversationId: string): Promise<Record<number, string[]>> {
    await this.#ready;
    const result: Record<number, string[]> = {};
    for (const item of this.#state.chart_calls) {
      if (item.conversation_id !== conversationId) continue;
      (result[item.item_index] ??= []).push(item.tool_name);
    }
    return result;
  }

  async chartsForConversation(conversationId: string): Promise<string[]> {
    await this.#ready;
    return [
      ...new Set(
        this.#state.chart_calls
          .filter((item) => item.conversation_id === conversationId)
          .map((item) => item.tool_name),
      ),
    ];
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.#ready;
    delete this.#state.conversations[conversationId];
    this.#state.chart_calls = this.#state.chart_calls.filter(
      (item) => item.conversation_id !== conversationId,
    );
    await this.#persist();
  }
}
