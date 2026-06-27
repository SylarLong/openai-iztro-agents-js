/** Factory for the hosted Ziwei model as a stock OpenAI Agents SDK model. */

import { OpenAIChatCompletionsModel } from '@openai/agents';
import OpenAI from 'openai';

export const DEFAULT_BASE_URL = 'https://chat-api.iztro.com';
export const IZTRO_ZIWEI_MODEL = 'iztro-ziwei-v3';

export interface IztroZiweiModelOptions {
  /** `sk_ziwei_*` key. Falls back to `ZIWEI_API_KEY`. */
  apiKey?: string;
  /** Backend origin. Falls back to `ZIWEI_BASE_URL`, then {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Hosted model name. */
  model?: string;
}

/**
 * Build the hosted Ziwei agent as a stock `OpenAIChatCompletionsModel`.
 *
 * The iztro chart tools run inside this model on the server (hidden). `apiKey` /
 * `baseUrl` fall back to `ZIWEI_API_KEY` / `ZIWEI_BASE_URL`.
 *
 * ```ts
 * import { Agent, run } from '@openai/agents';
 * import { iztroZiweiModel } from 'openai-iztro-agents';
 *
 * const agent = new Agent({ name: 'Ziwei', model: iztroZiweiModel({ apiKey: KEY }), tools: [...] });
 * await run(agent, '…');
 * ```
 */
export function iztroZiweiModel(
  options: IztroZiweiModelOptions = {},
): OpenAIChatCompletionsModel {
  const apiKey = options.apiKey ?? process.env.ZIWEI_API_KEY;
  if (!apiKey) {
    throw new Error('apiKey is required (pass apiKey or set ZIWEI_API_KEY)');
  }
  const base = (options.baseUrl ?? process.env.ZIWEI_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const client = new OpenAI({ apiKey, baseURL: `${base}/v2` });
  // The SDK bundles its own `openai` types; under NodeNext the import/require type
  // identities differ even for the same physical module, so pin to the ctor's type.
  type ClientArg = ConstructorParameters<typeof OpenAIChatCompletionsModel>[0];
  return new OpenAIChatCompletionsModel(client as unknown as ClientArg, options.model ?? IZTRO_ZIWEI_MODEL);
}
