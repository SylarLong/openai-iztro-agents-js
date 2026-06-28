/**
 * Factory for the hosted Ziwei model as a stock OpenAI Agents SDK model.
 *
 * The hosted agent runs the iztro chart tools on the server and reports which ran via a
 * custom `iztro_tools` field on the chat-completion response. The base SDK does not expose
 * it as a first-class value, so {@link IztroZiweiModel} surfaces it where it belongs:
 *
 * - non-streaming: each `result.rawResponses[i]` is an {@link IztroModelResponse} carrying
 *   that call's `iztroTools`;
 * - streaming: an {@link IztroToolsStreamEvent} is emitted as each tool is called.
 *
 * It never fakes standard tool calls (which would make the SDK try to execute the
 * server-side tools locally).
 */

import { OpenAIChatCompletionsModel } from '@openai/agents';
import type { ModelRequest, ModelResponse, ResponseStreamEvent } from '@openai/agents';
import OpenAI from 'openai';

export const DEFAULT_BASE_URL = 'https://chat-api.iztro.com';
export const IZTRO_ZIWEI_MODEL = 'iztro-ziwei-v3';

/** The `type` discriminator carried by an {@link IztroToolsStreamEvent}. */
export const IZTRO_TOOLS_EVENT_TYPE = 'iztro_tools';

/**
 * A streamed event emitted as the server runs an iztro chart tool, *before* the answer.
 *
 * During a streamed run the model emits one of these as each batch of server-side iztro
 * tools is called. It rides the SDK's normal event stream, so it surfaces while iterating
 * the run as a `raw_model_stream_event` whose `.data` is this object — handle it in the
 * same loop as text deltas:
 *
 * ```ts
 * for await (const event of stream) {
 *   if (event.type === 'raw_model_stream_event') {
 *     if (isIztroToolsStreamEvent(event.data)) console.log('iztro:', event.data.tools);
 *     else if (event.data.type === 'output_text_delta') process.stdout.write(event.data.delta);
 *   }
 * }
 * ```
 */
export interface IztroToolsStreamEvent {
  type: typeof IZTRO_TOOLS_EVENT_TYPE;
  /** The new public iztro tool labels for this batch, e.g. `['iztro-liunian 2026']`. */
  tools: string[];
}

/** Narrow a streamed `raw_model_stream_event`'s `.data` to an {@link IztroToolsStreamEvent}. */
export function isIztroToolsStreamEvent(data: unknown): data is IztroToolsStreamEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === IZTRO_TOOLS_EVENT_TYPE &&
    Array.isArray((data as { tools?: unknown }).tools)
  );
}

/**
 * A {@link ModelResponse} that also carries the hidden server-side iztro chart tools that
 * ran for *this* model call. Read it per call after a non-streaming run:
 *
 * ```ts
 * const result = await run(agent, '…');
 * for (const resp of result.rawResponses) {
 *   console.log((resp as IztroModelResponse).iztroTools);
 * }
 * ```
 *
 * Because it lives on the response, a multi-step run keeps every call's tools instead of
 * overwriting them.
 */
export interface IztroModelResponse extends ModelResponse {
  iztroTools: string[];
}

/**
 * Read the custom `iztro_tools` field off a raw ChatCompletion / ChatCompletionChunk. The
 * openai client keeps unknown top-level fields on the parsed object.
 */
function extractIztroTools(obj: unknown): string[] {
  const val = (obj as { iztro_tools?: unknown } | null | undefined)?.iztro_tools;
  return Array.isArray(val) ? val.map((x) => String(x)) : [];
}

export interface IztroZiweiModelOptions {
  /** `sk_ziwei_*` key. Falls back to `ZIWEI_API_KEY`. */
  apiKey?: string;
  /** Backend origin. Falls back to `ZIWEI_BASE_URL`, then {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Hosted model name. */
  model?: string;
}

/**
 * Stock chat-completions model that also surfaces the hidden server-side iztro tools.
 *
 * - Non-streaming (`run`): each `result.rawResponses[i]` is an {@link IztroModelResponse}
 *   whose `iztroTools` lists that call's tools.
 * - Streaming: an {@link IztroToolsStreamEvent} is emitted as each tool is called.
 *
 * `lastIztroTools` is a convenience holding the most recent call's tools.
 */
export class IztroZiweiModel extends OpenAIChatCompletionsModel {
  /** The iztro tools from the most recent model call. */
  lastIztroTools: string[] = [];

  async getResponse(request: ModelRequest): Promise<IztroModelResponse> {
    // The base keeps the entire raw ChatCompletion on `providerData`, so the custom
    // `iztro_tools` field survives there — lift it onto a first-class `iztroTools`.
    const response = await super.getResponse(request);
    const tools = extractIztroTools(response.providerData);
    this.lastIztroTools = tools;
    return { ...response, iztroTools: tools };
  }

  async *getStreamedResponse(request: ModelRequest): AsyncIterable<ResponseStreamEvent> {
    // Every raw chunk arrives as a `model` event; the iztro tools are a custom top-level
    // field on the chunk, sent as each tool is called (before the answer). Emit a distinct
    // IztroToolsStreamEvent per NEW tool, right before passing the chunk through.
    this.lastIztroTools = [];
    const seen = new Set<string>();
    for await (const event of super.getStreamedResponse(request)) {
      if ((event as { type?: string }).type === 'model') {
        const fresh = extractIztroTools((event as { event?: unknown }).event).filter(
          (t) => !seen.has(t),
        );
        if (fresh.length > 0) {
          fresh.forEach((t) => seen.add(t));
          this.lastIztroTools = [...seen];
          const iztroEvent: IztroToolsStreamEvent = {
            type: IZTRO_TOOLS_EVENT_TYPE,
            tools: fresh,
          };
          yield iztroEvent as unknown as ResponseStreamEvent;
        }
      }
      yield event;
    }
  }
}

/**
 * Build the hosted Ziwei agent as an {@link IztroZiweiModel}.
 *
 * The iztro chart tools run inside this model on the server (hidden). `apiKey` / `baseUrl`
 * fall back to `ZIWEI_API_KEY` / `ZIWEI_BASE_URL`. After a run, read the server-side iztro
 * tools from `result.rawResponses[i].iztroTools` (non-streaming) or from an
 * {@link IztroToolsStreamEvent} (streaming).
 *
 * ```ts
 * import { Agent, run } from '@openai/agents';
 * import { iztroZiweiModel } from 'openai-iztro-agents';
 *
 * const agent = new Agent({ name: 'Ziwei', model: iztroZiweiModel({ apiKey: KEY }), tools: [...] });
 * const result = await run(agent, '…');
 * console.log((result.rawResponses.at(-1) as IztroModelResponse).iztroTools);
 * ```
 */
export function iztroZiweiModel(options: IztroZiweiModelOptions = {}): IztroZiweiModel {
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
  return new IztroZiweiModel(client as unknown as ClientArg, options.model ?? IZTRO_ZIWEI_MODEL);
}
