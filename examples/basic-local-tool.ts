/**
 * Basic example: a local function tool the hosted Ziwei agent can call.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/basic-local-tool.ts
 *
 * (Once installed from npm, import from 'openai-iztro-agents' instead of '../src'.)
 */

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { ChatSession, iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

const addToCalendar = tool({
  name: 'add_to_calendar',
  description: 'Add an event to the user calendar. Runs locally in this process.',
  parameters: z.object({
    date: z.string().describe('ISO date, e.g. "2026-07-03".'),
    title: z.string().describe('Short event title.'),
  }),
  execute: async ({ date, title }) => `Added '${title}' on ${date}.`,
});

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({
    tools: [addToCalendar],
    instructions: 'You are a helpful Ziwei assistant.',
    apiKey: API_KEY,
  });
  const session = new ChatSession({ externalUserId: 'user_42', apiKey: API_KEY });
  const result = await run(
    agent,
    'Today is 2026-06-26. I was born on 1990-06-15 at 10:00, male. Pick one auspicious ' +
      'day next week based on my chart and add it to my calendar.',
    { session },
  );
  console.log(result.finalOutput);
  await session.close();
}

main();
