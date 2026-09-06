/**
 * Example 13 — Fast Ziwei managed session (illustrative best-practice shape).
 *
 * This mirrors a common customer integration: configure the person's profile once in
 * the agent instructions, choose the latency-optimized Ziwei model, and reuse one
 * ChatSession for follow-up turns instead of repeating birth details.
 *
 * This is an example, not a complete production backend. Keep the API key server-side,
 * derive `externalUserId` from your authenticated user, and persist `sessionId` in your
 * own database when the conversation must survive a process restart.
 *
 * Run: ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/13-fast-ziwei-session-best-practice.ts
 */

import { run } from '@openai/agents';

import { ChatSession, iztroZiweiFastAgent } from '../src/index.js';

function requireApiKey(): string {
  const apiKey = process.env.ZIWEI_API_KEY;
  if (!apiKey) throw new Error('Set ZIWEI_API_KEY before running this example.');
  return apiKey;
}

function messageWithLocalTime(message: string): string {
  return `${message}\n发送时间：${new Date().toISOString()}`;
}

async function main(): Promise<void> {
  const apiKey = requireApiKey();
  const agent = iztroZiweiFastAgent({
    apiKey,
    instructions:
      '回答尽可能精短有力、通俗易懂；列出关键词、原因和结论即可。' +
      '用户未明确要求时不主动提供建议，回答控制在 100 字左右。' +
      '分析对象：birthday=1993-11-07，birth_hour=10，gender=女。',
    modelSettings: { reasoning: { effort: 'none' } },
  });
  const session = new ChatSession({
    externalUserId: 'authenticated_user_123',
    apiKey,
  });

  try {
    const questions = [
      '分析我 2028 年的事业变化。',
      '继续比较 2029 年与 2028 年的事业变化。',
      '分析我在感情关系中需要注意的模式。',
    ];
    for (const question of questions) {
      const result = await run(agent, messageWithLocalTime(question), { session });
      console.log(result.finalOutput);
    }

    console.log('sessionId:', session.sessionId);
  } finally {
    await session.close();
  }
}

main();
