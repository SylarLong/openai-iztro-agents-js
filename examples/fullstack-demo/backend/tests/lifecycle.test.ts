import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import supertest from 'supertest';

interface MemoryState {
  counter: number;
  conversations: Record<string, unknown[]>;
  owners: Record<string, string | undefined>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatStream(deltas: string[]): Response {
  const chunks = deltas.map((delta, index) => ({
    id: 'chatcmpl-demo',
    object: 'chat.completion.chunk',
    model: 'iztro-ziwei-v3',
    choices: [{
      index: 0,
      delta: index === 0 ? { role: 'assistant', content: delta } : { content: delta },
      finish_reason: null,
    }],
  }));
  chunks.push({
    id: 'chatcmpl-demo',
    object: 'chat.completion.chunk',
    model: 'iztro-ziwei-v3',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  } as never);
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function fakeFetch(state: MemoryState): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const parts = url.pathname.split('/').filter(Boolean);

    if (url.pathname.endsWith('/v2/chat/completions') && method === 'POST') {
      return chatStream(['命盘', '回答']);
    }

    if (url.pathname.endsWith('/platform/conversations') && method === 'POST') {
      state.counter += 1;
      const conversationId = `conv_${state.counter}`;
      const body = JSON.parse(await request.text() || '{}');
      state.conversations[conversationId] = [];
      state.owners[conversationId] = body.external_user_id;
      return json({ conversation_id: conversationId });
    }

    if (parts.includes('users') && url.pathname.endsWith('/conversations') && method === 'GET') {
      const userId = parts[parts.indexOf('users') + 1];
      const items = Object.entries(state.owners)
        .filter(([, owner]) => owner === userId)
        .map(([conversationId]) => ({ conversation_id: conversationId }))
        .reverse();
      return json({ items });
    }

    if (url.pathname.includes('/items')) {
      const conversationId = parts[parts.indexOf('conversations') + 1];
      const items = state.conversations[conversationId];
      if (!items) return json({ detail: 'not found' }, 404);
      if (url.pathname.endsWith('/items/last') && method === 'DELETE') {
        return json({ item: items.pop() ?? null });
      }
      if (method === 'GET') return json({ items: [...items] });
      if (method === 'POST') {
        const body = JSON.parse(await request.text());
        items.push(...body.items);
        return json({ ok: true });
      }
    }

    if (parts.includes('conversations') && method === 'DELETE') {
      const conversationId = parts[parts.indexOf('conversations') + 1];
      delete state.conversations[conversationId];
      delete state.owners[conversationId];
      return json({ ok: true });
    }

    return json({ detail: `Unhandled ${method} ${url.pathname}` }, 404);
  }) as typeof fetch;
}

test('new, stream, resume, rename, fork, list, and delete lifecycle', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'iztro-js-demo-'));
  process.env.ZIWEI_API_KEY = 'sk_ziwei_test';
  process.env.ZIWEI_BASE_URL = 'http://ziwei.test';
  process.env.DEMO_METADATA_PATH = join(dataDirectory, 'metadata.json');

  const originalFetch = globalThis.fetch;
  const state: MemoryState = { counter: 0, conversations: {}, owners: {} };
  globalThis.fetch = fakeFetch(state);
  try {
    const { app } = await import('../src/app.js');
    const client = supertest(app);

    const created = await client
      .post('/api/conversations')
      .send({ external_user_id: 'alice', title: '新会话' })
      .expect(201);
    const conversationId = created.body.conversation_id as string;

    const streamed = await client
      .post(`/api/conversations/${conversationId}/messages/stream`)
      .send({ external_user_id: 'alice', message: '看看我的命盘' })
      .expect(200);
    assert.match(streamed.text, /event: delta/);
    assert.match(streamed.text, /命盘/);
    assert.match(streamed.text, /event: done/);

    const detail = await client
      .get(`/api/conversations/${conversationId}`)
      .query({ external_user_id: 'alice' })
      .expect(200);
    assert.deepEqual(detail.body.messages.map((message: { role: string }) => message.role), [
      'user',
      'assistant',
    ]);
    assert.equal(detail.body.messages[1].text, '命盘回答');

    const renamed = await client
      .patch(`/api/conversations/${conversationId}`)
      .send({ external_user_id: 'alice', title: '事业分析' })
      .expect(200);
    assert.equal(renamed.body.title, '事业分析');

    const forked = await client
      .post(`/api/conversations/${conversationId}/fork`)
      .send({ external_user_id: 'alice' })
      .expect(201);
    assert.equal(forked.body.parent_conversation_id, conversationId);

    const listed = await client
      .get('/api/conversations')
      .query({ external_user_id: 'alice' })
      .expect(200);
    assert.deepEqual(
      new Set(listed.body.items.map((item: { conversation_id: string }) => item.conversation_id)),
      new Set([conversationId, forked.body.conversation_id]),
    );

    await client
      .delete(`/api/conversations/${forked.body.conversation_id}`)
      .query({ external_user_id: 'alice' })
      .expect(204);
    assert.equal(state.conversations[forked.body.conversation_id], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
