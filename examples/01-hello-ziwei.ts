/**
 * Example 01 — Hello, Ziwei. Your first program: one rich, professional reading.
 *
 * You give your birth details, and the agent returns a genuine 紫微斗数 (Purple Star
 * Astrology) reading — grounded in your actual chart (命宫主星、四化、十二宫), not generic
 * horoscope filler. The chart is computed and summarized on the server automatically.
 *
 * BEFORE YOU RUN
 *   1. npm install openai-iztro-agents   (examples here import from ../src for local dev)
 *   2. Get an API key (sk_ziwei_…) from the developer console.
 *   3. Run with your key:
 *        ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/01-hello-ziwei.ts
 *
 * NEXT → examples/02-prompt-gallery.ts shows many themes (fortune, career, love, wealth).
 */

import { run } from '@openai/agents';

import { iztroZiweiAgent, type IztroModelResponse } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

async function main(): Promise<void> {
  // The `instructions` set the agent's expertise and depth. This is where you make it
  // read like a seasoned 紫微斗数 master rather than a generic assistant: ask it to cite
  // the actual chart and be specific. The chart itself is computed for you on the server.
  const agent = iztroZiweiAgent({
    instructions:
      '你是一位资深的紫微斗数命理师。请基于用户的真实命盘给出专业、具体、有条理的解读：\n' +
      '- 点出命宫主星、身宫、关键的四化（化禄/化权/化科/化忌）与重要宫位；\n' +
      '- 结合星曜组合给出有依据的判断，避免空泛的套话；\n' +
      '- 分段叙述：性格特质、天赋优势、需要注意的课题、可落地的建议。\n' +
      '请用用户使用的语言作答，语气温暖而专业。',
    apiKey: API_KEY,
  });

  // The agent reads the chart automatically — you only supply the birth details.
  const result = await run(
    agent,
    '我出生于 1990 年 6 月 15 日上午 10:00，男性。请给我一份完整的个人性格与人生格局解读。',
  );

  // Which chart tools the server ran to ground this reading. In a non-streaming run they
  // ride on each model call's response, so read them off result.rawResponses.
  const last = result.rawResponses.at(-1) as IztroModelResponse;
  console.log('🔮 iztro computed:', last.iztroTools.join(', '));
  console.log(result.finalOutput);
}

main();
