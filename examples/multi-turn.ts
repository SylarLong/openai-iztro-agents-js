/**
 * Multi-turn memory + resume + listing a user's conversations (ChatSession).
 *
 * History lives on the server, keyed by a server-generated conversation id and owned by
 * your `externalUserId`.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/multi-turn.ts
 */

import { run } from '@openai/agents';

import { ChatSession, iztroZiweiAgent, listUserConversations } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({
    instructions: 'You are a helpful assistant. Answer briefly.',
    apiKey: API_KEY,
  });

  // New conversation owned by your user — the server assigns the id.
  const session = new ChatSession({ externalUserId: 'user_42', apiKey: API_KEY });
  console.log('T1:', (await run(agent, 'My name is Alice, born 1990-06-15.', { session })).finalOutput);
  console.log('T2:', (await run(agent, "What's my name and birth date?", { session })).finalOutput);

  const convId = session.sessionId; // server-generated; save this to resume later
  console.log('conversation id:', convId);

  // Manage a user's chats.
  const convs = await listUserConversations('user_42', { apiKey: API_KEY });
  console.log('user_42 conversations:', convs.map((c) => c.conversation_id));

  // Resume that conversation in a fresh session.
  const resumed = new ChatSession({ conversationId: convId, apiKey: API_KEY });
  console.log('Resumed:', (await run(agent, 'What did I first tell you?', { session: resumed })).finalOutput);

  await session.close();
  await resumed.close();
}

main();
