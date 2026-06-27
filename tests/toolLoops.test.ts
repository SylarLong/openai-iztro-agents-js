/**
 * Diverse, offline tool-loop scenarios for the hosted Ziwei model + local tools.
 *
 * Every test stubs `/v2/chat/completions` (no key, no network) and exercises a different
 * shape of the passthrough loop: plain chat, single/parallel/sequential tool calls,
 * typed arguments, local errors, unicode, and SDK tool-call settings.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { run, tool } from '@openai/agents';
import { z } from 'zod';

import {
  agentWith,
  assistantText,
  assistantToolCalls,
  installFetch,
  mockChat,
} from './_mock.js';

afterEach(() => vi.unstubAllGlobals());

describe('tool loops', () => {
  // 1) Pure chat: no developer tools, no tool calls — a single assistant message.
  it('plain chat with no tools', async () => {
    const chat = mockChat(assistantText('紫微星坐命，主贵气。'));
    installFetch(chat.route);
    const result = await run(agentWith(), '概述我的命宫主星');
    expect(result.finalOutput).toBe('紫微星坐命，主贵气。');
    expect(result.newItems.map((i) => i.constructor.name)).toEqual(['RunMessageOutputItem']);
    expect(chat.advertisedTools).toEqual([[]]); // iztro stays hidden server-side
  });

  // 2) Single tool with richly-typed arguments (str, int, list) round-trips intact.
  it('single tool with typed args', async () => {
    const captured: Record<string, unknown> = {};
    const planItinerary = tool({
      name: 'plan_itinerary',
      description: 'Draft a travel itinerary. Runs locally.',
      parameters: z.object({ city: z.string(), days: z.number(), activities: z.array(z.string()) }),
      execute: async ({ city, days, activities }) => {
        Object.assign(captured, { city, days, activities });
        return `${days}-day plan for ${city}: ${activities.join(', ')}`;
      },
    });
    const chat = mockChat(
      assistantToolCalls(['plan_itinerary', { city: 'Kyoto', days: 3, activities: ['temples', 'tea'] }]),
      assistantText('Your Kyoto trip is set.'),
    );
    installFetch(chat.route);
    const result = await run(agentWith([planItinerary]), 'plan a lucky trip');
    expect(captured).toEqual({ city: 'Kyoto', days: 3, activities: ['temples', 'tea'] });
    expect(result.finalOutput).toBe('Your Kyoto trip is set.');
    expect(chat.advertisedTools[0]).toEqual(['plan_itinerary']);
  });

  // 3) Parallel tool calls: two tools requested in one assistant turn.
  it('parallel tool calls', async () => {
    const order: string[] = [];
    const color = tool({
      name: 'get_lucky_color', description: 'lucky color',
      parameters: z.object({ element: z.string() }),
      execute: async ({ element }) => { order.push('color'); return element === 'fire' ? 'red' : 'white'; },
    });
    const number = tool({
      name: 'get_lucky_number', description: 'lucky number',
      parameters: z.object({ element: z.string() }),
      execute: async () => { order.push('number'); return '3'; },
    });
    const chat = mockChat(
      assistantToolCalls(['get_lucky_color', { element: 'fire' }], ['get_lucky_number', { element: 'fire' }]),
      assistantText('Red, and the number 3.'),
    );
    installFetch(chat.route);
    const result = await run(agentWith([color, number]), 'lucky color and number?');
    expect(new Set(order)).toEqual(new Set(['color', 'number']));
    expect(result.newItems.map((i) => i.constructor.name)).toEqual([
      'RunToolCallItem', 'RunToolCallItem', 'RunToolCallOutputItem', 'RunToolCallOutputItem', 'RunMessageOutputItem',
    ]);
    expect(result.finalOutput).toContain('Red');
  });

  // 4) Sequential multi-step: tool A, then (next round) tool B, then a final answer.
  it('sequential multi-step', async () => {
    const steps: string[] = [];
    const lookup = tool({
      name: 'lookup_birth_chart', description: 'step 1',
      parameters: z.object({ date: z.string() }),
      execute: async () => { steps.push('chart'); return '命宫: 太阳'; },
    });
    const addCal = tool({
      name: 'add_to_calendar', description: 'step 2',
      parameters: z.object({ date: z.string(), title: z.string() }),
      execute: async ({ date, title }) => { steps.push('calendar'); return `Added '${title}' on ${date}`; },
    });
    const chat = mockChat(
      assistantToolCalls(['lookup_birth_chart', { date: '1990-06-15' }]),
      assistantToolCalls(['add_to_calendar', { date: '2026-07-01', title: '吉日' }]),
      assistantText('Chart read; July 1st booked.'),
    );
    installFetch(chat.route);
    const result = await run(agentWith([lookup, addCal]), 'read my chart then book a good day');
    expect(steps).toEqual(['chart', 'calendar']); // strict ordering across rounds
    expect(chat.requests.length).toBe(3); // three model round-trips
    expect(result.finalOutput).toContain('booked');
  });

  // 5) Several tools available; iztro is never advertised on any round.
  it('iztro is never advertised', async () => {
    const a = tool({ name: 'tool_a', description: 'A', parameters: z.object({}), execute: async () => 'a' });
    const b = tool({ name: 'tool_b', description: 'B', parameters: z.object({}), execute: async () => 'b' });
    const chat = mockChat(assistantToolCalls(['tool_b', {}]), assistantText('done'));
    installFetch(chat.route);
    await run(agentWith([a, b]), 'use a tool');
    for (const advertised of chat.advertisedTools) {
      expect(new Set(advertised)).toEqual(new Set(['tool_a', 'tool_b']));
      expect(advertised.some((n) => n.startsWith('iztro'))).toBe(false);
    }
  });

  // 6) A local tool that throws: the SDK feeds the error back and the model recovers.
  it('recovers from a local tool error', async () => {
    const divine = tool({
      name: 'divine', description: 'always fails this run',
      parameters: z.object({ question: z.string() }),
      execute: async () => { throw new Error('oracle offline'); },
    });
    let toolMsg = '';
    const chat = mockChat(
      assistantToolCalls(['divine', { question: 'career?' }]),
      (body) => {
        toolMsg = body.messages[body.messages.length - 1].content ?? '';
        return assistantText('Let me try a different reading instead.');
      },
    );
    installFetch(chat.route);
    const result = await run(agentWith([divine]), 'what about my career?');
    expect(toolMsg).toContain('oracle offline');
    expect(result.finalOutput).toBe('Let me try a different reading instead.');
  });

  // 7) Unicode all the way through: Chinese prompt, Chinese tool args and output.
  it('unicode round-trip', async () => {
    const got: Record<string, unknown> = {};
    const note = tool({
      name: 'record_note', description: '记录一条笔记',
      parameters: z.object({ title: z.string(), content: z.string() }),
      execute: async ({ title, content }) => { Object.assign(got, { title, content }); return `已记录《${title}》`; },
    });
    const chat = mockChat(
      assistantToolCalls(['record_note', { title: '流年运势', content: '丙午年宜稳健' }]),
      assistantText('已为你记录流年笔记。'),
    );
    installFetch(chat.route);
    const result = await run(agentWith([note]), '帮我记一条流年笔记');
    expect(got).toEqual({ title: '流年运势', content: '丙午年宜稳健' });
    expect(result.finalOutput).toBe('已为你记录流年笔记。');
  });

  // 8) SDK tool-call settings (toolChoice / parallelToolCalls) reach the wire.
  it('tool settings pass through to the request', async () => {
    const noop = tool({ name: 'noop', description: 'no-op', parameters: z.object({}), execute: async () => 'ok' });
    const chat = mockChat(assistantToolCalls(['noop', {}]), assistantText('finished'));
    installFetch(chat.route);
    const agent = agentWith([noop], {
      modelSettings: { toolChoice: 'required', parallelToolCalls: true },
    });
    await run(agent, 'go');
    expect(chat.requests[0].tool_choice).toBe('required');
    expect(chat.requests[0].parallel_tool_calls).toBe(true);
  });
});
