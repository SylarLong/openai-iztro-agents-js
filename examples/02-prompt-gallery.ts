/**
 * Example 02 — Prompt gallery: many themes, professional depth.
 *
 * The showcase. Several ready-to-use prompts — personality, this year's fortune (流年运势),
 * career, love & marriage, wealth — each giving a thorough, chart-grounded reading. This
 * is what sets the Ziwei agent apart from a generic chatbot.
 *
 * Use it as a menu: copy any prompt into your own app, or add your own (health, study…).
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/02-prompt-gallery.ts
 */

import { run } from '@openai/agents';

import { iztroZiweiAgent, type IztroModelResponse } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

// A master-level persona — this is the main lever for quality. It asks for specific,
// chart-based answers (real star names, 四化, 宫位) instead of horoscope filler.
const INSTRUCTIONS =
  '你是一位资深紫微斗数命理师。请基于用户的真实命盘作答，引用具体的星曜、四化与宫位，' +
  '给出有依据、有条理、可落地的解读，避免空泛套话。用用户的语言作答，分段清晰。';

// Each prompt already includes the birth details. Just edit or add full prompts here.
const PROMPTS = [
  '我出生于 1990 年 6 月 15 日上午 10:00，男性。请深入分析我的性格特质、思维方式与人际风格，并指出天赋与盲点。',
  '我出生于 1990 年 6 月 15 日上午 10:00，男性。今天是 2026-06-26（丙午年），请分析我今年的整体运势，含关键月份提醒。',
  '我出生于 1990 年 6 月 15 日上午 10:00，男性。请分析我的事业格局：适合的行业、发展节奏、贵人方位与突破建议。',
  '我出生于 1990 年 6 月 15 日上午 10:00，男性。请分析我的感情与婚姻：正缘特质、相处模式与经营建议。',
  '我出生于 1990 年 6 月 15 日上午 10:00，男性。请分析我的财运：正财偏财强弱、理财风格与聚财建议。',
];

async function main(): Promise<void> {
  // One agent, reused for every theme — only the question changes.
  const agent = iztroZiweiAgent({ instructions: INSTRUCTIONS, apiKey: API_KEY });

  for (let i = 0; i < PROMPTS.length; i++) {
    console.log('\n' + '═'.repeat(64));
    console.log(`  Reading ${i + 1}/${PROMPTS.length}`);
    console.log('═'.repeat(64) + '\n');
    const result = await run(agent, PROMPTS[i]);
    const last = result.rawResponses.at(-1) as IztroModelResponse;
    console.log('🔮 iztro computed:', last.iztroTools.join(', '));
    console.log(result.finalOutput);
  }
}

main();
