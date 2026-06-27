/**
 * Example 03 — Streaming: print the answer as it is written.
 *
 * Same as example 01, but instead of waiting for the whole reply, we print it piece by
 * piece as it arrives — the "typing" effect you see in chat apps.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/03-streaming-chat.ts
 *
 * NOTE: Streaming is for plain chat. If you also need local tools (examples 06–07), use
 * the normal `run(agent, input)` instead.
 */

import { run } from '@openai/agents';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({
    instructions: 'You are a helpful Ziwei astrology guide.',
    apiKey: API_KEY,
  });

  // `{ stream: true }` returns immediately; the text arrives over time.
  const streamed = await run(
    agent,
    'Born 1988-02-20 at 6am, female. Give me an uplifting outlook for this year.',
    { stream: true },
  );

  process.stdout.write('>> The reading is being written:\n\n');
  // toTextStream() yields the assistant text in chunks, like live typing.
  for await (const chunk of streamed.toTextStream()) process.stdout.write(chunk);
  await streamed.completed;

  // Once streaming ends, the whole text is also available in one piece.
  console.log('\n\n=== Full reply (for reference) ===');
  console.log(streamed.finalOutput);
}

main();
