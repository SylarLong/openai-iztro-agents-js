/**
 * Example 07 — A multi-step task with YOUR tools, used in sequence.
 *
 * The Ziwei agent reads and summarizes the birth chart AUTOMATICALLY on the server. You
 * do NOT write a tool for that. Your tools are only for things in YOUR world — here, your
 * own calendar. Two tools are used in order, where the second depends on the first:
 *   Step 1 — `check_availability`: is that day free in my calendar?
 *   Step 2 — `add_to_calendar`: if it's free, book it.
 *
 * Run:  ZIWEI_API_KEY=sk_ziwei_... npx tsx examples/07-multi-step-booking.ts
 */

import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { iztroZiweiAgent } from '../src/index.js';

const API_KEY = process.env.ZIWEI_API_KEY ?? 'sk_ziwei_REPLACE_WITH_YOUR_KEY';

// A pretend calendar. In a real app this is Google Calendar, Outlook, your database, etc.
// Pretend July 2nd is already taken, so the agent has to work around it.
const myCalendar: { date: string; title: string }[] = [{ date: '2026-07-02', title: 'Dentist' }];

const checkAvailability = tool({
  name: 'check_availability',
  description: 'Check whether the user calendar is FREE on a given day.',
  parameters: z.object({ date: z.string().describe('ISO date like "2026-07-03".') }),
  execute: async ({ date }) => {
    const taken = myCalendar.some((e) => e.date === date);
    console.log(`  [checking] ${date} -> ${taken ? 'BUSY' : 'free'}`);
    return taken ? 'busy' : 'free';
  },
});

const addToCalendar = tool({
  name: 'add_to_calendar',
  description: 'Add ONE event to the user calendar. Only call this for a free day.',
  parameters: z.object({ date: z.string(), title: z.string() }),
  execute: async ({ date, title }) => {
    console.log(`  [booking] add_to_calendar(date=${JSON.stringify(date)}, title=${JSON.stringify(title)})`);
    myCalendar.push({ date, title });
    return `Added '${title}' on ${date}.`;
  },
});

async function main(): Promise<void> {
  const agent = iztroZiweiAgent({
    tools: [checkAvailability, addToCalendar],
    instructions:
      "You are a Ziwei guide. The user's chart is available to you automatically. " +
      'Pick ONE auspicious weekday next week, FIRST check it with check_availability, ' +
      'and only if it is free, book it with add_to_calendar. If it is busy, try the ' +
      'next auspicious day. Do not ask the user any questions.',
    apiKey: API_KEY,
  });

  const result = await run(
    agent,
    'Today is 2026-06-26. I was born on 1990-06-15 at 10:00, male. ' +
      'Find a good day next week for an important meeting and put it on my calendar.',
  );

  console.log('\n=== Final reply ===');
  console.log(result.finalOutput);
  console.log('\nYour calendar now holds:', myCalendar);
}

main();
