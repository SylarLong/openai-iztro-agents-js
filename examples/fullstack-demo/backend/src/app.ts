import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response as ExpressResponse } from 'express';
import {
  ChatSession,
  isIztroToolEvent,
  iztroZiweiAgent,
  listUserConversations,
  run,
} from 'openai-iztro-agents';

import { MetadataStore } from './store.js';
import type { ConversationMetadata } from './store.js';

const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: join(BACKEND_DIR, '.env') });

// Quick local setup: paste a test key here. Restore the placeholder before committing.
const INLINE_ZIWEI_API_KEY = 'sk_ziwei_replace_me';
const API_KEY = INLINE_ZIWEI_API_KEY !== 'sk_ziwei_replace_me'
  ? INLINE_ZIWEI_API_KEY
  : (process.env.ZIWEI_API_KEY ?? '');
const BASE_URL = process.env.ZIWEI_BASE_URL;
const METADATA_PATH = resolve(
  BACKEND_DIR,
  process.env.DEMO_METADATA_PATH ?? './data/metadata.json',
);
const CORS_ORIGINS = (process.env.DEMO_CORS_ORIGINS ??
  'http://localhost:5193,http://127.0.0.1:5193')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const store = new MetadataStore(METADATA_PATH);
export const app = express();

app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '128kb' }));

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const asyncRoute = (handler: RequestHandler): RequestHandler =>
  (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };

function requireApiKey(): string {
  if (!API_KEY || API_KEY === 'sk_ziwei_replace_me') {
    throw new HttpError(503, '请先在 backend/.env 中配置 ZIWEI_API_KEY。');
  }
  return API_KEY;
}

function session(options: { conversationId?: string; externalUserId?: string } = {}) {
  return new ChatSession({
    ...options,
    apiKey: requireApiKey(),
    baseUrl: BASE_URL,
  });
}

function agent() {
  return iztroZiweiAgent({
    apiKey: requireApiKey(),
    baseUrl: BASE_URL,
    instructions:
      '你是一位清晰、可靠的紫微斗数助手。需要命盘时先确认出生日期、时辰和性别；' +
      '说明判断依据，避免绝对化结论，并用简洁中文给出可行动的建议。',
  });
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') return text;
      if (text && typeof text === 'object' && typeof (text as { value?: unknown }).value === 'string') {
        return (text as { value: string }).value;
      }
      return '';
    })
    .join('');
}

export function normalizeMessages(
  items: unknown[],
  chartsByItem: Record<number, string[]> = {},
) {
  return items.flatMap((unknownItem, itemIndex) => {
    if (!unknownItem || typeof unknownItem !== 'object') return [];
    const item = unknownItem as Record<string, unknown>;
    const role = item.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') return [];
    const text = textFromContent(item.content);
    if (!text) return [];
    return [
      {
        id: String(item.id ?? `item-${itemIndex}`),
        item_index: itemIndex,
        role,
        text,
        charts: chartsByItem[itemIndex] ?? [],
      },
    ];
  });
}

async function summary(metadata: ConversationMetadata) {
  return {
    ...metadata,
    charts: await store.chartsForConversation(metadata.conversation_id),
  };
}

async function ensureOwned(conversationId: string, externalUserId: string) {
  requireApiKey();
  const metadata = await store.getConversation(conversationId);
  if (metadata) {
    if (metadata.external_user_id !== externalUserId) {
      throw new HttpError(404, '会话不存在。');
    }
    return metadata;
  }

  const remoteItems = await listUserConversations(externalUserId, {
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    limit: 100,
  });
  const found = remoteItems.some(
    (item) => String(item.conversation_id ?? item.id ?? '') === conversationId,
  );
  if (!found) throw new HttpError(404, '会话不存在。');
  return store.ensureConversation(conversationId, externalUserId);
}

function writeEvent(response: ExpressResponse, event: string, payload: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function startEventStream(response: ExpressResponse): void {
  response.status(200);
  response.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
}

async function streamTurn(
  response: ExpressResponse,
  chatSession: ChatSession,
  conversationId: string,
  message: string,
): Promise<void> {
  const tools: string[] = [];
  try {
    const metadata = await store.getConversation(conversationId);
    if (metadata) writeEvent(response, 'conversation', await summary(metadata));

    const streamed = await run(agent(), message, { session: chatSession, stream: true });
    for await (const event of streamed) {
      if (event.type !== 'raw_model_stream_event') continue;
      const data = event.data as unknown;
      if (isIztroToolEvent(data)) {
        const newTools = data.tools.filter((tool) => !tools.includes(tool));
        if (newTools.length) {
          tools.push(...newTools);
          writeEvent(response, 'chart', { tools: newTools });
        }
      } else if (
        event.data.type === 'output_text_delta' &&
        typeof event.data.delta === 'string' &&
        event.data.delta
      ) {
        writeEvent(response, 'delta', { delta: event.data.delta });
      }
    }
    await streamed.completed;

    const items = await chatSession.getItems();
    let assistantIndex = Math.max(items.length - 1, 0);
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index] as unknown as Record<string, unknown>;
      if (item?.role === 'assistant') {
        assistantIndex = index;
        break;
      }
    }
    await store.recordChartCalls(conversationId, assistantIndex, tools);
    await store.titleFromFirstMessage(conversationId, message);
    const finalOutput = typeof streamed.finalOutput === 'string' ? streamed.finalOutput : '';
    await store.updateActivity(conversationId, {
      lastMessage: finalOutput.slice(0, 160),
      itemCount: items.length,
    });
    writeEvent(response, 'done', {
      conversation_id: conversationId,
      text: finalOutput,
      charts: tools,
      item_count: items.length,
    });
  } catch (error) {
    writeEvent(response, 'error', { message: errorMessage(error) });
  } finally {
    await chatSession.close();
    if (!response.writableEnded) response.end();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败。';
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    configured: Boolean(API_KEY && API_KEY !== 'sk_ziwei_replace_me'),
    iztro_api_base_url: BASE_URL ?? 'https://chat-api.iztro.com',
  });
});

app.get(
  '/api/conversations',
  asyncRoute(async (request, response) => {
    const externalUserId = clean(request.query.external_user_id);
    if (!externalUserId) throw new HttpError(400, 'external_user_id 不能为空。');
    requireApiKey();
    const remoteItems = await listUserConversations(externalUserId, {
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      limit: 100,
    });
    const remoteIds = new Set<string>();
    for (const item of remoteItems) {
      const conversationId = String(item.conversation_id ?? item.id ?? '');
      if (!conversationId) continue;
      remoteIds.add(conversationId);
      await store.ensureConversation(conversationId, externalUserId);
    }
    const items = await Promise.all(
      (await store.listConversations(externalUserId))
        .filter((item) => remoteIds.has(item.conversation_id))
        .map(summary),
    );
    response.json({ items });
  }),
);

app.post(
  '/api/conversations',
  asyncRoute(async (request, response) => {
    const externalUserId = clean(request.body?.external_user_id);
    const title = clean(request.body?.title) || '新会话';
    if (!externalUserId) throw new HttpError(400, 'external_user_id 不能为空。');
    const chatSession = session({ externalUserId });
    await chatSession.getItems();
    const metadata = await store.ensureConversation(chatSession.sessionId, externalUserId, {
      title,
    });
    response.status(201).json(await summary(metadata));
  }),
);

app.get(
  '/api/conversations/:conversationId',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const externalUserId = clean(request.query.external_user_id);
    const metadata = await ensureOwned(conversationId, externalUserId);
    const chatSession = session({ conversationId, externalUserId });
    const items = await chatSession.getItems();
    await store.updateActivity(conversationId, { itemCount: items.length });
    const refreshed = (await store.getConversation(conversationId)) ?? metadata;
    response.json({
      ...(await summary(refreshed)),
      messages: normalizeMessages(items, await store.chartsByItem(conversationId)),
    });
  }),
);

app.patch(
  '/api/conversations/:conversationId',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const externalUserId = clean(request.body?.external_user_id);
    const title = clean(request.body?.title);
    await ensureOwned(conversationId, externalUserId);
    if (!title) throw new HttpError(400, '标题不能为空。');
    await store.renameConversation(conversationId, title);
    response.json(await summary((await store.getConversation(conversationId))!));
  }),
);

app.delete(
  '/api/conversations/:conversationId',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const externalUserId = clean(request.query.external_user_id);
    await ensureOwned(conversationId, externalUserId);
    await session({ conversationId, externalUserId }).clearSession();
    await store.deleteConversation(conversationId);
    response.status(204).end();
  }),
);

app.post(
  '/api/conversations/:conversationId/fork',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const externalUserId = clean(request.body?.external_user_id);
    const parent = await ensureOwned(conversationId, externalUserId);
    const source = session({ conversationId, externalUserId });
    const sourceItems = await source.getItems();
    const requestedCount = request.body?.item_count;
    const itemCount = requestedCount === undefined || requestedCount === null
      ? sourceItems.length
      : Number(requestedCount);
    if (!Number.isInteger(itemCount) || itemCount < 0 || itemCount > sourceItems.length) {
      throw new HttpError(400, '分支位置超出会话长度。');
    }
    const forked = await source.fork({ itemCount, externalUserId });
    const title = clean(request.body?.title) || `${parent.title} · 分支`;
    const metadata = await store.ensureConversation(forked.sessionId, externalUserId, {
      title: title.slice(0, 80),
      parentConversationId: conversationId,
      forkedAtItem: itemCount,
    });
    const copiedMessages = normalizeMessages(sourceItems.slice(0, itemCount));
    await store.updateActivity(forked.sessionId, {
      itemCount,
      lastMessage: copiedMessages.at(-1)?.text.slice(0, 160) ?? '',
    });
    await store.copyChartCalls(conversationId, forked.sessionId, itemCount);
    response.status(201).json(await summary(metadata));
  }),
);

app.post(
  '/api/conversations/:conversationId/messages/stream',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const externalUserId = clean(request.body?.external_user_id);
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    await ensureOwned(conversationId, externalUserId);
    if (!message) throw new HttpError(400, '消息不能为空。');
    startEventStream(response);
    await streamTurn(response, session({ conversationId, externalUserId }), conversationId, message);
  }),
);

app.post(
  '/api/conversations/:conversationId/messages/:itemIndex/edit/stream',
  asyncRoute(async (request, response) => {
    const conversationId = String(request.params.conversationId);
    const itemIndex = Number(request.params.itemIndex);
    const externalUserId = clean(request.body?.external_user_id);
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    const parent = await ensureOwned(conversationId, externalUserId);
    if (!message) throw new HttpError(400, '消息不能为空。');

    const source = session({ conversationId, externalUserId });
    const items = await source.getItems();
    const item = items[itemIndex] as unknown as Record<string, unknown> | undefined;
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) {
      throw new HttpError(404, '要编辑的消息不存在。');
    }
    if (item?.role !== 'user') throw new HttpError(400, '只能编辑用户消息。');

    const forked = await source.fork({ itemCount: itemIndex, externalUserId });
    await store.ensureConversation(forked.sessionId, externalUserId, {
      title: `${parent.title} · 编辑分支`.slice(0, 80),
      parentConversationId: conversationId,
      forkedAtItem: itemIndex,
    });
    await store.copyChartCalls(conversationId, forked.sessionId, itemIndex);
    startEventStream(response);
    await streamTurn(response, forked, forked.sessionId, message);
  }),
);

app.use((error: unknown, _request: Request, response: ExpressResponse, _next: NextFunction) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  response.status(statusCode).json({ detail: errorMessage(error) });
});
