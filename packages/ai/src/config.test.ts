import { describe, expect, it } from "vitest";
import { buildCallRecord, fanOut, usageCounts } from "./calls";
import { effortFor, modelFor, providerChain, readAiConfig } from "./config";
import { estimateCostMicros, formatUsd } from "./pricing";
import { providerOptions } from "./providers";

const ENV = {
  OPENAI_API_KEY: "sk-proj-real",
  META_MODEL_API_KEY: "meta-real",
  AI_FALLBACK_PROVIDER: "meta",
};

describe("readAiConfig", () => {
  it("defaults to OpenAI with the demo models, a 12 s timeout and 2 retries", () => {
    const config = readAiConfig(ENV);
    expect(config).toMatchObject({
      enabled: true,
      primary: "openai",
      fallback: "meta",
      reasoningEffort: "low",
      timeoutMs: 12_000,
      retries: 2,
      breaker: { failures: 3, windowMs: 60_000 },
    });
    expect(config.providers.openai?.models).toEqual({
      primary: "gpt-6-sol",
      fast: "gpt-6-luna",
    });
    expect(config.providers.meta?.baseUrl).toBe("https://api.meta.ai/v1");
  });

  it("reads model overrides, the reasoning effort and the AI_ENABLED switch", () => {
    const config = readAiConfig({
      ...ENV,
      AI_ENABLED: "false",
      AI_PROVIDER: "META",
      OPENAI_MODEL_PRIMARY: "gpt-6-luna",
      OPENAI_REASONING_EFFORT: "none",
      META_MODEL_FAST: "muse-spark-1.3-contributor",
    });
    expect(config.enabled).toBe(false);
    expect(config.primary).toBe("meta");
    expect(config.reasoningEffort).toBe("none");
    expect(config.providers.openai?.models.primary).toBe("gpt-6-luna");
    expect(config.providers.meta?.models.fast).toBe(
      "muse-spark-1.3-contributor",
    );
  });

  it("treats placeholder keys as missing so the chain skips that provider", () => {
    const config = readAiConfig({
      OPENAI_API_KEY: "sk-proj-xxx",
      META_MODEL_API_KEY: "meta-real",
      AI_FALLBACK_PROVIDER: "meta",
    });
    expect(config.providers.openai).toBeUndefined();
    expect(providerChain(config).map((p) => p.id)).toEqual(["meta"]);
  });

  it("orders the chain primary first and drops duplicates", () => {
    const config = readAiConfig({
      ...ENV,
      AI_PROVIDER: "meta",
      AI_FALLBACK_PROVIDER: "meta",
    });
    expect(providerChain(config).map((p) => p.id)).toEqual(["meta"]);
    expect(providerChain(readAiConfig(ENV)).map((p) => p.id)).toEqual([
      "openai",
      "meta",
    ]);
  });

  it("maps tasks to model roles and reasoning effort", () => {
    const config = readAiConfig(ENV);
    const openai = config.providers.openai;
    if (!openai) throw new Error("openai missing");
    expect(["A1", "A2", "A4"].map((t) => modelFor(openai, t as "A1"))).toEqual([
      "gpt-6-sol",
      "gpt-6-sol",
      "gpt-6-sol",
    ]);
    expect(modelFor(openai, "A3")).toBe("gpt-6-luna");
    expect(effortFor(config, "A1")).toBe("low");
    expect(effortFor(config, "A5")).toBe("none");
  });

  it("passes reasoningEffort to OpenAI only", () => {
    const config = readAiConfig(ENV);
    expect(providerOptions(config.providers.openai as never, "low")).toEqual({
      openai: { reasoningEffort: "low" },
    });
    expect(
      providerOptions(config.providers.meta as never, "low"),
    ).toBeUndefined();
  });
});

describe("cost accounting", () => {
  it("prices cached input separately (SDD §10.4)", () => {
    // gpt-6-sol: 3,000 fresh × $2 + 500 cached × $0.20 + 1,200 out × $10 per 1M.
    expect(
      estimateCostMicros("gpt-6-sol", {
        inputTokens: 3_000,
        cachedTokens: 500,
        outputTokens: 1_200,
      }),
    ).toBe(18_100);
    expect(formatUsd(18_100)).toBe("$0.0181");
    expect(
      estimateCostMicros("renamed-model", {
        inputTokens: 10,
        cachedTokens: 0,
        outputTokens: 10,
      }),
    ).toBe(0);
  });

  it("splits the SDK's input total into fresh and cached tokens", () => {
    expect(
      usageCounts({
        inputTokens: 1_000,
        inputTokenDetails: {
          cacheReadTokens: 800,
          noCacheTokens: 200,
          cacheWriteTokens: undefined,
        },
        outputTokens: 50,
        outputTokenDetails: { textTokens: 50, reasoningTokens: undefined },
        totalTokens: 1_050,
      }),
    ).toEqual({ inputTokens: 200, cachedTokens: 800, outputTokens: 50 });
    expect(usageCounts(undefined)).toEqual({
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
    });
  });

  it("records failures with zero tokens and a short reason", () => {
    const record = buildCallRecord({
      task: "A3",
      provider: "openai",
      model: "gpt-6-luna",
      latencyMs: 12.6,
      fellBack: false,
      error: "http_429",
      at: "2026-09-26T12:00:00Z",
    });
    expect(record).toMatchObject({
      costUsdMicros: 0,
      latencyMs: 13,
      error: "http_429",
      planId: null,
    });
  });

  it("fans out to every sink even when one throws", async () => {
    const seen: string[] = [];
    const errors: unknown[] = [];
    const sink = fanOut(
      [
        () => {
          throw new Error("down");
        },
        (r) => {
          seen.push(r.task);
        },
      ],
      (e) => errors.push(e),
    );
    await sink(
      buildCallRecord({
        task: "A1",
        provider: "openai",
        model: "gpt-6-sol",
        latencyMs: 1,
        fellBack: false,
      }),
    );
    expect(seen).toEqual(["A1"]);
    expect(errors).toHaveLength(1);
  });
});
