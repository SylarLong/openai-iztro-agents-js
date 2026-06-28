/**
 * Example 05 — Your first tool: a local function the hosted Ziwei agent can call.
 *
 * A "tool" is one of your functions the agent is allowed to call. You define it with
 * `tool(...)`, list it when you build the agent, and the agent decides when to call it.
 * Your tools run locally, in this process.
 *
 * The agent reads the chart AUTOMATICALLY (on the server — you never write a tool for
 * that). Your tools are only for YOUR world (calendar, email, notes, your own data).
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/05-basic-local-tool.ts
 */

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { ChatSession, iztroZiweiAgent, type IztroModelResponse } from '../src/index.js';

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
  // A local tool makes the run span several model calls; each call's response carries its
  // own iztro tools, so gather them across result.rawResponses (deduped, in order).
  const used = [
    ...new Set(result.rawResponses.flatMap((r) => (r as IztroModelResponse).iztroTools ?? [])),
  ];
  console.log('🔮 iztro computed:', used.join(', '));
  console.log(result.finalOutput);
  await session.close();
}

main();
