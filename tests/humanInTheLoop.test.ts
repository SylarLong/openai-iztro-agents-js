/**
 * Human-in-the-loop via the native SDK approval flow — offline.
 *
 * A `tool({ needsApproval: true })` pauses the run; `run(...)` returns with
 * `interruptions`. We approve/reject on `result.state` and resume by running the same
 * state. Covers approve, reject, and a mixed approve+reject turn.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { run, tool } from '@openai/agents';
import { z } from 'zod';

import { agentWith, assistantText, assistantToolCalls, installFetch, mockChat } from './_mock.js';

afterEach(() => vi.unstubAllGlobals());

/** Run, then approve/reject each pending tool by name per `decisions`, until done. */
async function resumeWith(agent: ReturnType<typeof agentWith>, decisions: Record<string, boolean>) {
  let result = await run(agent, 'act on my chart');
  const rounds = [result.interruptions.length];
  while (result.interruptions.length) {
    for (const item of result.interruptions) {
      const name = item.name ?? 'tool';
      if (decisions[name]) result.state.approve(item);
      else result.state.reject(item);
    }
    result = await run(agent, result.state);
    rounds.push(result.interruptions.length);
  }
  return { result, rounds };
}

describe('human-in-the-loop', () => {
  it('approve runs the tool', async () => {
    const sent: Array<[string, string]> = [];
    const sendEmail = tool({
      name: 'send_email', description: 'Send an email on the user behalf.',
      parameters: z.object({ to: z.string(), body: z.string() }),
      needsApproval: true,
      execute: async ({ to, body }) => { sent.push([to, body]); return `sent to ${to}`; },
    });
    installFetch(
      mockChat(
        assistantToolCalls(['send_email', { to: 'me@example.com', body: 'good year ahead' }]),
        assistantText('Email sent — onward to a bright year.'),
      ).route,
    );
    const { result, rounds } = await resumeWith(agentWith([sendEmail]), { send_email: true });
    expect(rounds[0]).toBe(1); // paused for approval
    expect(sent).toEqual([['me@example.com', 'good year ahead']]);
    expect(result.finalOutput).toContain('Email sent');
  });

  it('reject never runs the tool', async () => {
    const sent: Array<[string, string]> = [];
    const sendEmail = tool({
      name: 'send_email', description: 'Send an email on the user behalf.',
      parameters: z.object({ to: z.string(), body: z.string() }),
      needsApproval: true,
      execute: async ({ to, body }) => { sent.push([to, body]); return `sent to ${to}`; },
    });
    installFetch(
      mockChat(
        assistantToolCalls(['send_email', { to: 'me@example.com', body: 'draft' }]),
        assistantText("Understood — I won't send anything."),
      ).route,
    );
    const { result, rounds } = await resumeWith(agentWith([sendEmail]), { send_email: false });
    expect(rounds[0]).toBe(1);
    expect(sent).toEqual([]); // rejected → never executed locally
    expect(result.finalOutput).toContain("won't send");
  });

  it('mixed approve + reject in one turn', async () => {
    const executed: Array<[string, unknown]> = [];
    const bookFlight = tool({
      name: 'book_flight', description: 'Book a flight.',
      parameters: z.object({ dest: z.string() }), needsApproval: true,
      execute: async ({ dest }) => { executed.push(['flight', dest]); return `flight to ${dest} booked`; },
    });
    const wireMoney = tool({
      name: 'wire_money', description: 'Wire money.',
      parameters: z.object({ amount: z.number() }), needsApproval: true,
      execute: async ({ amount }) => { executed.push(['money', amount]); return `wired ${amount}`; },
    });
    installFetch(
      mockChat(
        assistantToolCalls(['book_flight', { dest: 'Tokyo' }], ['wire_money', { amount: 5000 }]),
        assistantText('Flight booked; the transfer was held back.'),
      ).route,
    );
    const { result, rounds } = await resumeWith(
      agentWith([bookFlight, wireMoney]),
      { book_flight: true, wire_money: false },
    );
    expect(rounds[0]).toBe(2); // both paused in the same turn
    expect(executed).toEqual([['flight', 'Tokyo']]); // only the approved one ran
    expect(result.finalOutput).toContain('Flight booked');
  });
});
