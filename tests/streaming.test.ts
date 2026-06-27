/**
 * Streaming chat via `run(agent, input, { stream: true })` — offline, mocked SSE.
 *
 * The hosted backend streams a plain answer. We assert the text deltas arrive in order
 * and that `finalOutput` reassembles them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '@openai/agents';

import { agentWith, installFetch, mockChat, sseStream } from './_mock.js';

afterEach(() => vi.unstubAllGlobals());

async function streamText(agent: ReturnType<typeof agentWith>, prompt: string) {
  const streamed = await run(agent, prompt, { stream: true });
  let text = '';
  for await (const chunk of streamed.toTextStream()) text += chunk;
  await streamed.completed;
  return { text, finalOutput: streamed.finalOutput };
}

describe('streaming', () => {
  it('text deltas reassemble into finalOutput', async () => {
    installFetch(mockChat(sseStream(['Your ', 'Purple ', 'Star ', 'shines.'])).route);
    const { text, finalOutput } = await streamText(agentWith(), 'describe my star');
    expect(text).toBe('Your Purple Star shines.');
    expect(finalOutput).toBe('Your Purple Star shines.');
  });

  it('streams unicode', async () => {
    installFetch(mockChat(sseStream(['紫微', '在', '命宫'])).route);
    const { text, finalOutput } = await streamText(agentWith(), '我的命宫主星？');
    expect(text).toBe('紫微在命宫');
    expect(finalOutput).toBe('紫微在命宫');
  });
});
