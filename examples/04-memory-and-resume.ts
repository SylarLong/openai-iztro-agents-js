/**
 * Example 04 — Conversation memory & RESUME: pick a chat up later (ChatSession).
 *
 * The agent remembers a conversation because the history lives on the SERVER under a
 * conversation id. The one thing YOU keep is that id: `session.sessionId`.
 *
 *   • First visit  → start a ChatSession (the server assigns an id), chat, then SAVE the id.
 *   • Come back later → rebuild `new ChatSession({ conversationId: savedId })` and keep
 *                       going — even in a brand-new process, or after your server restarts.
 *
 * This is exactly what a chat backend does: store the id per user, reload it next request.
 * The two phases below share NOTHING except `savedId` — no objects are reused.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/04-memory-and-resume.ts
 */

import { run } from '@openai/agents';

import { ChatSession, iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

function buildAgent() {
  return iztroZiweiAgent({ instructions: 'You are a helpful assistant. Answer briefly.', apiKey: API_KEY });
}

/** Start a new conversation and return the id you must save to resume it later. */
async function firstVisit(): Promise<string> {
  const agent = buildAgent();
  // externalUserId records which of YOUR users owns this chat; the server makes the id.
  const session = new ChatSession({ externalUserId: 'user_42', apiKey: API_KEY });

  console.log('── First visit ──');
  console.log('T1:', (await run(agent, 'My name is Alice, born 1990-06-15.', { session })).finalOutput);
  console.log('T2:', (await run(agent, "What's my name and birth date?", { session })).finalOutput);

  const savedId = session.sessionId; // ← persist this (e.g. db.save(userId, savedId))
  console.log('saved conversation id:', savedId);
  await session.close();
  return savedId;
}

/** A later request / new process: rebuild the session from ONLY the saved id. */
async function comeBackLater(savedId: string): Promise<void> {
  const agent = buildAgent();
  const session = new ChatSession({ conversationId: savedId, apiKey: API_KEY }); // resume

  console.log('\n── Come back later (resumed from the id) ──');
  console.log('T3:', (await run(agent, 'What did I first tell you?', { session })).finalOutput);
  await session.close();
}

async function main(): Promise<void> {
  const savedId = await firstVisit();
  // ... time passes, the process could exit here; all you need is savedId ...
  await comeBackLater(savedId);
}

main();
