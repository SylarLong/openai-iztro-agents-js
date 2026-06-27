/**
 * Live end-to-end test against a deployed backend (opt-in).
 *
 * Skipped unless ZIWEI_API_KEY is set. Drives the stock Agents SDK `run` with a local
 * tool against the real hosted Ziwei agent.
 *
 *   ZIWEI_API_KEY=sk_ziwei_... npx vitest run tests/live.test.ts
 *   # prod: ZIWEI_BASE_URL=https://chat-api.iztro.com
 */

import { describe, expect, it } from 'vitest';
import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY;
const BASE_URL = process.env.ZIWEI_BASE_URL ?? 'https://api-dev.ziwei.guru';

describe.skipIf(!API_KEY)('live dev-tool loop', () => {
  it('the agent calls the local tool and answers', async () => {
    const executed: Array<[string, string]> = [];
    const addToCalendar = tool({
      name: 'add_to_calendar',
      description: 'Add an event to the user calendar.',
      parameters: z.object({ date: z.string(), title: z.string() }),
      execute: async ({ date, title }) => {
        executed.push([date, title]);
        return `Added '${title}' on ${date}`;
      },
    });

    const agent = iztroZiweiAgent({
      tools: [addToCalendar],
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      instructions: 'You are a helpful Ziwei assistant.',
    });
    const result = await run(
      agent,
      'Today is 2026-06-26. I was born on 1990-06-15 at 10:00, male. Pick ONE concrete ' +
        'auspicious date next week based on my chart, then you MUST call the add_to_calendar ' +
        'tool (do not ask me anything). Confirm in one short sentence.',
    );

    expect(executed.length).toBeGreaterThan(0); // passthrough loop fired
    expect(result.finalOutput).toBeTruthy();
    console.log(`\ntool executed: ${JSON.stringify(executed)}\nfinal: ${result.finalOutput?.slice(0, 120)}`);
  }, 60_000);
});
