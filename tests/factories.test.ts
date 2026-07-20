/**
 * Config & wiring of the factories — offline.
 *
 * Validates credential/base-url resolution (args, env vars, defaults, trailing-slash
 * trimming) and the `/v2` suffix by observing the actual request the model makes, plus
 * that `iztroZiweiAgent` passes SDK arguments straight through to a stock `Agent`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent, run } from '@openai/agents';

import {
  ChatSession,
  DEFAULT_BASE_URL,
  IZTRO_QIMEN_MODEL,
  IZTRO_ZIWEI_MODEL,
  TOOL_EVENT_TYPE,
  iztroQimenAgent,
  iztroQimenModel,
  iztroZiweiAgent,
  iztroZiweiModel,
  isIztroToolEvent,
  isIztroToolsStreamEvent,
} from '../src/index.js';
import { assistantText, installFetch } from './_mock.js';

const ENV_KEYS = ['ZIWEI_API_KEY', 'ZIWEI_BASE_URL'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Run one turn through a fetch that records the chat-completions URL + body. */
async function captureRunRequest(makeAgent: () => Agent): Promise<{ url: string; body: any }> {
  const seen: { url: string; body: any } = { url: '', body: null };
  installFetch((url, init) => {
    if (!url.includes('/chat/completions')) return undefined;
    seen.url = url;
    seen.body = JSON.parse(init.body as string);
    return new Response(JSON.stringify(assistantText('ok')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  await run(makeAgent(), 'hi');
  return seen;
}

async function captureRequest(agentOpts: Record<string, unknown>): Promise<{ url: string; body: any }> {
  return captureRunRequest(() => iztroZiweiAgent(agentOpts));
}

describe('model factory', () => {
  it('requires an api key', () => {
    expect(() => iztroZiweiModel()).toThrow(/apiKey is required/);
  });

  it('exposes the documented constants', () => {
    expect(DEFAULT_BASE_URL).toBe('https://chat-api.iztro.com');
    expect(IZTRO_ZIWEI_MODEL).toBe('iztro-ziwei-v3');
    expect(IZTRO_QIMEN_MODEL).toBe('iztro-qimen-v3');
    expect(TOOL_EVENT_TYPE).toBe('tool_event');
  });

  it('keeps the old tool-event guard name working', () => {
    const event = { type: 'tool_event', tools: ['qimen-qigua'] };
    expect(isIztroToolEvent(event)).toBe(true);
    expect(isIztroToolsStreamEvent(event)).toBe(true);
  });

  it('uses the default base + /v2 and default model on the wire', async () => {
    process.env.ZIWEI_API_KEY = 'sk_ziwei_env';
    const { url, body } = await captureRequest({});
    expect(url).toBe(`${DEFAULT_BASE_URL}/v2/chat/completions`);
    expect(body.model).toBe(IZTRO_ZIWEI_MODEL);
  });

  it('has a qimen model factory', async () => {
    const { body } = await captureRunRequest(
      () => new Agent({ name: 'Qimen', model: iztroQimenModel({ apiKey: 'k' }) }),
    );
    expect(body.model).toBe(IZTRO_QIMEN_MODEL);
  });

  it('explicit baseUrl wins over env and trims a trailing slash', async () => {
    process.env.ZIWEI_BASE_URL = 'http://from-env.test';
    const explicit = await captureRequest({ apiKey: 'k', baseUrl: 'http://explicit.test/' });
    expect(explicit.url).toBe('http://explicit.test/v2/chat/completions');

    const fromEnv = await captureRequest({ apiKey: 'k' });
    expect(fromEnv.url).toBe('http://from-env.test/v2/chat/completions');
  });

  it('honors a custom model name on the wire', async () => {
    const { body } = await captureRequest({ apiKey: 'k', modelName: 'iztro-ziwei-v9' });
    expect(body.model).toBe('iztro-ziwei-v9');
  });
});

describe('agent factory', () => {
  it('is a stock Agent with passthrough config', () => {
    const agent = iztroZiweiAgent({ name: 'Stargazer', instructions: 'Be concise.', apiKey: 'k' });
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.name).toBe('Stargazer');
    expect(agent.instructions).toBe('Be concise.');
  });

  it('defaults name and empty tools', () => {
    const agent = iztroZiweiAgent({ apiKey: 'k' });
    expect(agent.name).toBe('Ziwei');
    expect(agent.tools).toEqual([]);
  });

  it('has a qimen agent factory', async () => {
    const agent = iztroQimenAgent({ apiKey: 'k' });
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.name).toBe('Qimen');
    expect(agent.tools).toEqual([]);
    const { body } = await captureRunRequest(() => iztroQimenAgent({ apiKey: 'k' }));
    expect(body.model).toBe(IZTRO_QIMEN_MODEL);
  });

  it('forwards the documented Qimen question time metadata', async () => {
    const { body } = await captureRunRequest(() =>
      iztroQimenAgent({
        apiKey: 'k',
        modelSettings: {
          providerData: {
            metadata: { current_datetime: '2026-07-20T14:30:00+08:00' },
          },
        },
      }),
    );
    expect(body.metadata).toEqual({ current_datetime: '2026-07-20T14:30:00+08:00' });
  });

  it('forwards extra kwargs to the SDK Agent', () => {
    const agent = iztroZiweiAgent({ apiKey: 'k', toolUseBehavior: 'stop_on_first_tool' });
    expect((agent as { toolUseBehavior: unknown }).toolUseBehavior).toBe('stop_on_first_tool');
  });

  it('requires an api key', () => {
    expect(() => iztroZiweiAgent()).toThrow(/apiKey is required/);
  });
});

describe('session factory', () => {
  it('requires an api key', () => {
    expect(() => new ChatSession({ externalUserId: 'user_42' })).toThrow(/apiKey is required/);
  });
});
