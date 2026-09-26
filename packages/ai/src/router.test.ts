import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AiDisabledError,
  AiUnavailableError,
  failureReason,
  forSession,
  isRetryable,
} from "./router";
import {
  httpError,
  scriptedModel,
  streamingModel,
  testRouter,
} from "./testing";

const Answer = z.object({ answer: z.string() });
const OPTIONS = {
  task: "A1" as const,
  schema: Answer,
  schemaName: "answer",
  system: "system",
  prompt: "prompt",
  planId: "p_1",
};

describe("AiRouter.run", () => {
  it("returns the validated object and logs one call with tokens and cost", async () => {
    const { router, log } = testRouter({
      models: { openai: scriptedModel([{ answer: "ok" }]) },
    });
    const { output, call } = await router.run(OPTIONS);
    expect(output).toEqual({ answer: "ok" });
    expect(log.records).toEqual([call]);
    expect(call).toMatchObject({
      task: "A1",
      provider: "openai",
      model: "gpt-6-sol",
      inputTokens: 1_000,
      outputTokens: 100,
      fellBack: false,
      error: null,
      planId: "p_1",
    });
    // gpt-6-sol: 1000 × $2/M + 100 × $10/M = $0.003.
    expect(call.costUsdMicros).toBe(3_000);
  });

  it("uses the fast model for A3 and A5", async () => {
    const { router } = testRouter({
      models: { openai: scriptedModel([{ answer: "x" }]) },
    });
    const { call } = await router.run({ ...OPTIONS, task: "A5" });
    expect(call.model).toBe("gpt-6-luna");
  });

  it("sends temperature 0 except to OpenAI while it reasons", async () => {
    const openai = scriptedModel([{ answer: "a" }]);
    const meta = scriptedModel([{ answer: "b" }]);
    const { router } = testRouter({ models: { openai, meta } });
    await router.run(OPTIONS);
    await router.run({ ...OPTIONS, task: "A5" });
    const metaOnly = testRouter({
      models: { meta },
      config: { primary: "meta", fallback: null },
    }).router;
    await metaOnly.run(OPTIONS);
    expect(openai.doGenerateCalls.map((c) => c.temperature)).toEqual([
      undefined,
      0,
    ]);
    expect(meta.doGenerateCalls.map((c) => c.temperature)).toEqual([0]);
  });

  it("retries a 429 twice, then falls back to the next provider", async () => {
    const sleeps: number[] = [];
    const openai = scriptedModel([httpError(429)]);
    const { router, log } = testRouter({
      models: { openai, meta: scriptedModel([{ answer: "from meta" }]) },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
    });
    const { output, call } = await router.run(OPTIONS);
    expect(output.answer).toBe("from meta");
    expect(openai.doGenerateCalls).toHaveLength(3);
    expect(sleeps).toEqual([188, 375]);
    expect(call).toMatchObject({
      provider: "meta",
      model: "muse-spark-1.3",
      fellBack: true,
    });
    expect(log.records.map((r) => r.error)).toEqual([
      "http_429",
      "http_429",
      "http_429",
      null,
    ]);
  });

  it("skips retries on a non-retryable error but still tries the fallback", async () => {
    const openai = scriptedModel([httpError(400)]);
    const meta = scriptedModel([{ answer: "from meta" }]);
    const { router } = testRouter({ models: { openai, meta } });
    await expect(router.run(OPTIONS)).resolves.toMatchObject({
      output: { answer: "from meta" },
    });
    expect(openai.doGenerateCalls).toHaveLength(1);
    expect(meta.doGenerateCalls).toHaveLength(1);
  });

  it("rejects output that does not match the schema", async () => {
    const { router, log } = testRouter({
      models: {
        openai: scriptedModel([{ wrong: 1 }]),
        meta: scriptedModel([{ wrong: 2 }]),
      },
    });
    await expect(router.run(OPTIONS)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(log.records.every((r) => r.error === "invalid_output")).toBe(true);
  });

  it("opens the breaker after 3 failures in the window and closes after the cooldown", async () => {
    let now = 0;
    const openai = scriptedModel([httpError(500)]);
    const { router } = testRouter({
      models: { openai },
      config: { fallback: null, retries: 0 },
      now: () => now,
    });
    for (let i = 0; i < 3; i++) {
      await expect(router.run(OPTIONS)).rejects.toBeInstanceOf(
        AiUnavailableError,
      );
    }
    expect(router.breakerOpen()).toBe(true);
    expect(router.available()).toBe(false);
    await expect(router.run(OPTIONS)).rejects.toMatchObject({
      reason: "circuit_open",
    });
    expect(openai.doGenerateCalls).toHaveLength(3);

    now = 60_000;
    expect(router.available()).toBe(true);
    // The probe fails, so the breaker opens again at once.
    await expect(router.run(OPTIONS)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(router.breakerOpen()).toBe(true);
  });

  it("refuses every call when AI is off or unconfigured", async () => {
    const off = testRouter({ models: {}, config: { enabled: false } }).router;
    await expect(off.run(OPTIONS)).rejects.toMatchObject({
      reason: "disabled",
    });
    const none = testRouter({ models: {}, config: { providers: {} } }).router;
    await expect(none.run(OPTIONS)).rejects.toMatchObject({
      reason: "not_configured",
    });
    expect(none.available()).toBe(false);
  });

  it("keeps a failing log sink from failing the call", async () => {
    const errors: unknown[] = [];
    const { router } = testRouter({
      models: { openai: scriptedModel([{ answer: "ok" }]) },
      sink: () => {
        throw new Error("db down");
      },
      onLogError: (e) => errors.push(e),
    });
    await expect(router.run(OPTIONS)).resolves.toMatchObject({
      output: { answer: "ok" },
    });
    expect(errors).toHaveLength(1);
  });

  it("times out a slow provider", async () => {
    const slow = scriptedModel([{ answer: "late" }]);
    slow.doGenerate = (options) =>
      new Promise((_, reject) => {
        options.abortSignal?.addEventListener("abort", () =>
          reject(options.abortSignal?.reason),
        );
      });
    const { router, log } = testRouter({
      models: { openai: slow },
      config: { fallback: null, retries: 0, timeoutMs: 20 },
    });
    await expect(router.run(OPTIONS)).rejects.toMatchObject({
      reason: "timeout",
    });
    expect(log.records[0]?.error).toBe("timeout");
  });
});

describe("AiRouter.runStream", () => {
  it("streams partial objects and resolves the full output with its call record", async () => {
    const { router, log } = testRouter({
      models: { openai: streamingModel({ answer: "streamed text" }, 6) },
    });
    const stream = await router.runStream(OPTIONS);
    const partials = [];
    for await (const p of stream.partials) partials.push(p);
    const { output, call } = await stream.completed;
    expect(partials.length).toBeGreaterThan(1);
    expect(output).toEqual({ answer: "streamed text" });
    expect(call.outputTokens).toBe(100);
    expect(log.records).toHaveLength(1);
  });
});

describe("forSession", () => {
  it("passes through when AI is on and refuses every call when the session turned it off", async () => {
    const { router } = testRouter({
      models: { openai: scriptedModel([{ answer: "ok" }]) },
    });
    expect(forSession(router, { aiOff: false })).toBe(router);
    const off = forSession(router, { aiOff: true });
    expect(off.available()).toBe(false);
    const error = await off.run(OPTIONS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiDisabledError);
    expect((error as AiDisabledError).reason).toBe("session_off");
    await expect(off.runStream(OPTIONS)).rejects.toBeInstanceOf(
      AiDisabledError,
    );
  });
});

describe("error classification", () => {
  it("retries transport failures only", () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
    expect(isRetryable(httpError(401))).toBe(false);
    expect(isRetryable(new DOMException("t", "TimeoutError"))).toBe(true);
    expect(isRetryable("nope")).toBe(false);
  });

  it("reports short reasons, never payloads", () => {
    expect(failureReason(httpError(429))).toBe("http_429");
    expect(failureReason(new DOMException("t", "TimeoutError"))).toBe(
      "timeout",
    );
    expect(failureReason(new Error("secret payload"))).toBe("call_failed");
  });
});
