/**
 * ChatSession memory semantics against an in-memory conversation store — offline.
 *
 * Covers lazy server-side id creation, add/get/pop/clear, multi-turn accumulation,
 * ownership by `externalUserId` + `listUserConversations`, resuming an explicit id
 * without a create call, and that the auth header is sent.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatSession, listUserConversations } from '../src/index.js';
import { InMemoryConversations, installFetch, TEST_BASE_URL } from './_mock.js';

afterEach(() => vi.unstubAllGlobals());

function session(backend: InMemoryConversations, opts: Record<string, unknown> = {}) {
  installFetch(backend.route);
  return new ChatSession({ apiKey: 'sk_ziwei_test', baseUrl: TEST_BASE_URL, ...opts });
}

describe('ChatSession', () => {
  it('id is lazy, then assigned on first use', async () => {
    const backend = new InMemoryConversations();
    const s = session(backend, { externalUserId: 'user_42' });
    expect(() => s.sessionId).toThrow(); // not created yet
    await s.addItems([{ role: 'user', content: 'hi' } as never]);
    expect(s.sessionId).toBe('conv_1'); // server assigned it on first use
    expect(backend.owners['conv_1']).toBe('user_42');
  });

  it('add / get / pop / clear', async () => {
    const backend = new InMemoryConversations();
    const s = session(backend);
    await s.addItems([
      { role: 'user', content: 'born 1990-06-15' } as never,
      { role: 'assistant', content: 'noted' } as never,
    ]);
    expect((await s.getItems()).map((i: any) => i.content)).toEqual(['born 1990-06-15', 'noted']);

    const popped = await s.popItem();
    expect((popped as any).content).toBe('noted');
    expect((await s.getItems()).map((i: any) => i.content)).toEqual(['born 1990-06-15']);

    const cid = s.sessionId;
    await s.clearSession();
    expect(backend.store[cid]).toBeUndefined(); // deleted on the server
    expect(() => s.sessionId).toThrow(); // next op will create a fresh one

    await s.addItems([{ role: 'user', content: 'again' } as never]);
    expect(s.sessionId).not.toBe(cid); // a brand-new conversation id
  });

  it('multi-turn history accumulates in order', async () => {
    const backend = new InMemoryConversations();
    const s = session(backend);
    await s.addItems([
      { role: 'user', content: 'q1' } as never,
      { role: 'assistant', content: 'a1' } as never,
    ]);
    await s.addItems([
      { role: 'user', content: 'q2' } as never,
      { role: 'assistant', content: 'a2' } as never,
    ]);
    expect((await s.getItems()).map((i: any) => i.content)).toEqual(['q1', 'a1', 'q2', 'a2']);
  });

  it('ownership + listUserConversations', async () => {
    const backend = new InMemoryConversations();
    installFetch(backend.route);
    const s1 = new ChatSession({ apiKey: 'k', baseUrl: TEST_BASE_URL, externalUserId: 'alice' });
    const s2 = new ChatSession({ apiKey: 'k', baseUrl: TEST_BASE_URL, externalUserId: 'alice' });
    const s3 = new ChatSession({ apiKey: 'k', baseUrl: TEST_BASE_URL, externalUserId: 'bob' });
    await s1.addItems([{ role: 'user', content: 'a' } as never]);
    await s2.addItems([{ role: 'user', content: 'b' } as never]);
    await s3.addItems([{ role: 'user', content: 'c' } as never]);

    const convs = await listUserConversations('alice', { apiKey: 'k', baseUrl: TEST_BASE_URL });
    const ids = new Set(convs.map((c) => c.conversation_id));
    expect(ids).toEqual(new Set([s1.sessionId, s2.sessionId])); // only alice's chats
    expect(ids.has(s3.sessionId)).toBe(false); // bob's excluded
  });

  it('resume with an explicit id skips creation', async () => {
    const backend = new InMemoryConversations();
    backend.store['conv_existing'] = [{ role: 'user', content: 'earlier' }];
    backend.owners['conv_existing'] = 'user_42';
    const s = session(backend, { conversationId: 'conv_existing' });

    expect(s.sessionId).toBe('conv_existing'); // available immediately, no create
    expect((await s.getItems())[0]).toMatchObject({ content: 'earlier' });
    expect(backend.counter).toBe(0); // no POST /conversations happened
  });

  it('sends the bearer auth header', async () => {
    const backend = new InMemoryConversations();
    const s = session(backend);
    await s.addItems([{ role: 'user', content: 'x' } as never]);
    expect(backend.authSeen.has('Bearer sk_ziwei_test')).toBe(true);
  });
});
