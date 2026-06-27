/**
 * Example 09 — Control output length & cost with a token limit (production knob).
 *
 * By default, let the agent answer fully — that depth is the whole point (see examples 01
 * and 02). But in production you sometimes need a HARD ceiling on how much the model can
 * produce, to bound cost and latency. That ceiling is `maxTokens`, set via `modelSettings`.
 *
 * Important framing:
 *   • This is a COST / SIZE control, not a quality setting. A low cap can cut a reading
 *     off mid-sentence — that's expected.
 *   • To make answers genuinely shorter *and* clean, guide it in the instructions instead
 *     (e.g. "give a 3-bullet summary"). Use `maxTokens` as a safety ceiling on top of that.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/09-limit-length-and-cost.ts
 */

import { run } from '@openai/agents';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

const INSTRUCTIONS = '你是一位资深紫微斗数命理师，请基于真实命盘给出专业、具体的解读。';
const PROMPT = '我出生于 1990 年 6 月 15 日上午 10:00，男性。请给我一份详细的命盘解读。';

/** No cap — the agent answers as fully as the chart warrants (the default, recommended). */
async function fullDepth(): Promise<void> {
  const agent = iztroZiweiAgent({ instructions: INSTRUCTIONS, apiKey: API_KEY });
  const result = await run(agent, PROMPT);
  console.log('─'.repeat(60), '\n① FULL DEPTH (no token cap — this is the default)\n');
  console.log(result.finalOutput);
}

/** Hard ceiling for cost control. Change `maxTokens` to trade depth for budget. */
async function capped(maxTokens: number): Promise<void> {
  const agent = iztroZiweiAgent({
    instructions: INSTRUCTIONS,
    apiKey: API_KEY,
    modelSettings: { maxTokens },
  });
  const result = await run(agent, PROMPT);
  console.log('\n' + '─'.repeat(60), `\n② CAPPED (maxTokens=${maxTokens} — a cost/size ceiling)\n`);
  console.log(result.finalOutput);
}

async function main(): Promise<void> {
  await fullDepth();
  // Try 120, 300, 800 and watch cost/length scale. Low values may truncate — that's the point.
  await capped(300);
}

main();
