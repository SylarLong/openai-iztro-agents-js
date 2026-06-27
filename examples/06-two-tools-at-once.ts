/**
 * Example 06 — Your own tools: the agent calls TWO of your functions in one turn.
 *
 * The agent reads the birth chart AUTOMATICALLY (on the server — you never write a tool
 * for it). It figures out the chart's dominant element on its own and calls YOUR lookup
 * functions with that element. Your tools are just your own data.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/06-two-tools-at-once.ts
 */

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

const getLuckyColor = tool({
  name: 'get_lucky_color',
  description: 'Return a lucky color for a five-element type (wood, fire, earth, metal, water).',
  parameters: z.object({ element: z.string().describe('One of wood / fire / earth / metal / water.') }),
  execute: async ({ element }) => {
    console.log(`  [your function ran] get_lucky_color(element=${JSON.stringify(element)})`);
    const table: Record<string, string> = { wood: 'green', fire: 'red', earth: 'yellow', metal: 'white', water: 'black' };
    return table[element.toLowerCase()] ?? 'gold';
  },
});

const getLuckyNumber = tool({
  name: 'get_lucky_number',
  description: 'Return a lucky number for a five-element type.',
  parameters: z.object({ element: z.string().describe('One of wood / fire / earth / metal / water.') }),
  execute: async ({ element }) => {
    console.log(`  [your function ran] get_lucky_number(element=${JSON.stringify(element)})`);
    const table: Record<string, number> = { wood: 3, fire: 9, earth: 5, metal: 7, water: 1 };
    return table[element.toLowerCase()] ?? 8;
  },
});

async function main(): Promise<void> {
  // List BOTH tools; the agent picks which to call (here, both).
  const agent = iztroZiweiAgent({
    tools: [getLuckyColor, getLuckyNumber],
    instructions: 'You are a Ziwei guide. Use the tools to give concrete lucky details.',
    apiKey: API_KEY,
  });

  const result = await run(
    agent,
    'Born 1995-09-09 at noon, female. Based on my chart\'s dominant element, ' +
      'tell me my lucky color and lucky number in one sentence.',
  );

  console.log('\n=== Final reply ===');
  console.log(result.finalOutput);
}

main();
