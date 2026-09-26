import { APICallError } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { type AiCallSink, memorySink } from "./calls";
import type { AiConfig, ProviderId } from "./config";
import { createRouter, type RouterDeps } from "./router";

/* Test doubles for the router: scripted models and a fixed configuration. */

export const TEST_CONFIG: AiConfig = {
  enabled: true,
  primary: "openai",
  fallback: "meta",
  providers: {
    openai: {
      id: "openai",
      apiKey: "sk-test",
      models: { primary: "gpt-6-sol", fast: "gpt-6-luna" },
    },
    meta: {
      id: "meta",
      apiKey: "meta-test",
      baseUrl: "https://api.meta.ai/v1",
      models: { primary: "muse-spark-1.3", fast: "muse-spark-1.3" },
    },
  },
  reasoningEffort: "low",
  timeoutMs: 12_000,
  retries: 2,
  breaker: { failures: 3, windowMs: 60_000, cooldownMs: 60_000 },
};

export function usage(input = 1_000, cached = 0, output = 100) {
  return {
    inputTokens: {
      total: input,
      noCache: input - cached,
      cacheRead: cached,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

const STOP = { unified: "stop" as const, raw: "stop" };

export function httpError(status: number): APICallError {
  return new APICallError({
    message: `HTTP ${status}`,
    url: "https://api.test/v1/responses",
    requestBodyValues: {},
    statusCode: status,
    isRetryable: status === 408 || status === 429 || status >= 500,
  });
}

/** A model that answers each call with the next scripted JSON value or error. */
export function scriptedModel(
  script: readonly (unknown | Error)[],
  modelId = "scripted",
): MockLanguageModelV4 {
  let i = 0;
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => {
      const step = script[Math.min(i++, script.length - 1)];
      if (step instanceof Error) throw step;
      return {
        content: [{ type: "text", text: JSON.stringify(step) }],
        finishReason: STOP,
        usage: usage(),
        warnings: [],
      };
    },
  });
}

/** A model that streams one JSON value in `chunks` text deltas. */
export function streamingModel(
  value: unknown,
  chunks = 4,
): MockLanguageModelV4 {
  const text = JSON.stringify(value);
  const size = Math.ceil(text.length / chunks);
  const deltas = Array.from({ length: chunks }, (_, k) =>
    text.slice(k * size, (k + 1) * size),
  ).filter(Boolean);
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          ...deltas.map((delta) => ({
            type: "text-delta" as const,
            id: "t",
            delta,
          })),
          { type: "text-end" as const, id: "t" },
          { type: "finish" as const, finishReason: STOP, usage: usage() },
        ],
      }),
    }),
  });
}

export type TestRouterOptions = {
  models: Partial<Record<ProviderId, MockLanguageModelV4>>;
  config?: Partial<AiConfig>;
  sink?: AiCallSink;
} & Omit<RouterDeps, "config" | "resolveModel" | "sink">;

/** A router whose providers resolve to the given mocks and whose sleeps are instant. */
export function testRouter(options: TestRouterOptions) {
  const log = memorySink();
  const { models, config, sink, ...deps } = options;
  const router = createRouter({
    sleep: async () => {},
    ...deps,
    config: { ...TEST_CONFIG, ...config },
    sink: sink ?? log.sink,
    resolveModel: (provider) => {
      const model = models[provider.id];
      if (!model) throw new Error(`no mock for ${provider.id}`);
      return model;
    },
  });
  return { router, log };
}
