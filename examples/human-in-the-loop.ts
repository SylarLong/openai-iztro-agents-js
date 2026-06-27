/**
 * Human-in-the-loop with the native SDK approval flow.
 *
 * A tool marked `needsApproval: true` pauses the run; `run(...)` returns a result with
 * `interruptions`. You approve/reject on `result.state`, then resume by running the
 * same state.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/human-in-the-loop.ts
 */

import { createInterface } from 'node:readline/promises';

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

const sendEmail = tool({
  name: 'send_email',
  description: 'Send an email on the user behalf.',
  parameters: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  needsApproval: true, // the SDK pauses before running this
  execute: async ({ to, subject }) => {
    console.log(`\n📧 [LOCAL] Sending email to ${to}\n   subject: ${subject}\n`);
    return `Email delivered to ${to}.`;
  },
});

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({ tools: [sendEmail], apiKey: API_KEY });
  let result = await run(
    agent,
    'I was born 1988-02-20 at 6am, female. Draft and send an encouraging email to ' +
      'me@example.com based on this year outlook.',
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  while (result.interruptions.length) {
    for (const item of result.interruptions) {
      const answer = await rl.question(`\nApprove ${item.name}(${item.arguments})? [y/N] `);
      if (answer.trim().toLowerCase().startsWith('y')) result.state.approve(item);
      else result.state.reject(item);
    }
    result = await run(agent, result.state);
  }
  rl.close();

  console.log('\n=== Final reply ===');
  console.log(result.finalOutput);
}

main();
