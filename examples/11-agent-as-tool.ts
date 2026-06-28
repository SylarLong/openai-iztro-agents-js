/**
 * Example 11 — Use the Ziwei agent as a TOOL inside your own agent.
 *
 * Package the Ziwei agent as a single tool and give it to a bigger "orchestrator" agent
 * that runs on YOUR model (e.g. GPT). The orchestrator decides when to consult the
 * astrologer, then does other things (book a calendar event) with the result.
 *
 *     your orchestrator agent (your model + your key)
 *       ├─ tool: ziwei_reading   ← the Ziwei agent, wrapped with .asTool(...)
 *       └─ tool: add_to_calendar ← your own local function
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... OPENAI_API_KEY=sk-... npx tsx examples/11-agent-as-tool.ts
 */

import { Agent, OpenAIChatCompletionsModel, run, tool } from '@openai/agents';
import OpenAI from 'openai';
import { z } from 'zod';

import { iztroZiweiAgent, type IztroZiweiModel } from '../src/index.js';

// Fill in your keys and model (or set them as environment variables).
const ZIWEI_API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'sk-REPLACE_WITH_YOUR_OPENAI_KEY';
const ORCHESTRATOR_MODEL = 'gpt-4o-mini'; // any model your OpenAI key can use

const myCalendar: { date: string; title: string }[] = [];

const addToCalendar = tool({
  name: 'add_to_calendar',
  description: 'Add ONE event to the user calendar.',
  parameters: z.object({ date: z.string(), title: z.string() }),
  execute: async ({ date, title }) => {
    console.log(`  [calendar] add_to_calendar(date=${JSON.stringify(date)}, title=${JSON.stringify(title)})`);
    myCalendar.push({ date, title });
    return `Added '${title}' on ${date}.`;
  },
});

async function main(): Promise<void> {
  // The Ziwei agent, wrapped as a tool the orchestrator can call. Keep a reference to the
  // agent: its model runs INSIDE the sub-agent, so its responses aren't in the
  // orchestrator's result.rawResponses — read the iztro tools off the model afterwards.
  const ziweiAgent = iztroZiweiAgent({
    instructions: '你是一位资深紫微斗数命理师，请基于真实命盘给出专业、具体的解读。',
    apiKey: ZIWEI_API_KEY,
  });
  const ziweiReading = ziweiAgent.asTool({
    toolName: 'ziwei_reading',
    toolDescription: 'Get a professional Ziwei reading. Pass birth date, time, gender, and the question.',
  });

  // Your orchestrator, running on your model. A stock Agent has no `apiKey` option —
  // you pass the key by giving it a model object that carries its own OpenAI client.
  const orchestrator = new Agent({
    name: 'Concierge',
    model: new OpenAIChatCompletionsModel(
      new OpenAI({ apiKey: OPENAI_API_KEY }) as unknown as ConstructorParameters<
        typeof OpenAIChatCompletionsModel
      >[0],
      ORCHESTRATOR_MODEL,
    ),
    instructions:
      'You are a personal concierge. For destiny, personality, or auspicious timing, ' +
      "call ziwei_reading. To schedule, call add_to_calendar. Don't ask follow-ups.",
    tools: [ziweiReading, addToCalendar],
  });

  const result = await run(
    orchestrator,
    'Today is 2026-06-26. I was born 1990-06-15 at 10:00, male. ' +
      'Ask the astrologer for one auspicious day next week, then put it on my calendar.',
  );
  // The sub-agent's tools aren't in the orchestrator's result; read them off its model.
  console.log('\n🔮 iztro computed:', (ziweiAgent.model as IztroZiweiModel).lastIztroTools.join(', '));
  console.log('\n=== Final reply ===');
  console.log(result.finalOutput);
  console.log('\nYour calendar now holds:', myCalendar);
}

main();
