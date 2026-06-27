/**
 * 示例 10 — 用中文对话（Chinese conversation）。
 *
 * 紫微斗数本来就是中文的。这个例子展示：你可以全程用中文提问，智能体也用中文回答；
 * 你自己写的工具函数可以保存中文内容（函数名用英文，符合代码规范）。
 *
 * 运行  RUN IT   ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/10-chinese-chat.ts
 */

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

const notebook: string[] = []; // 一个假装的笔记本，真实项目里可换成数据库

const saveNote = tool({
  name: 'save_note',
  description: '把一条笔记保存到用户的笔记本里。',
  parameters: z.object({
    title: z.string().describe('笔记的标题，例如“流年运势”。'),
    content: z.string().describe('笔记的正文。'),
  }),
  execute: async ({ title, content }) => {
    console.log(`  [本地函数执行] save_note(title=${JSON.stringify(title)}, content=${JSON.stringify(content)})`);
    notebook.push(`《${title}》${content}`);
    return `已记录：《${title}》`;
  },
});

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({
    tools: [saveNote],
    instructions: '你是一位温暖、鼓励人心的紫微斗数顾问，请用简体中文回答，语气亲切。',
    apiKey: API_KEY,
  });

  const result = await run(
    agent,
    '我出生于 1990 年 6 月 15 日上午 10 点，男性。请用三句话分析我的性格，并把要点用 save_note 工具记下来。',
  );

  console.log('\n=== 最终回复 ===');
  console.log(result.finalOutput);
  console.log('\n笔记本里现在有：', notebook);
}

main();
