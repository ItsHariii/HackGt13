import {
  APICallError,
  type DeepPartial,
  generateText,
  JSONParseError,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
  TypeValidationError,
} from "ai";
import type { z } from "zod";
import { type AiCallRecord, type AiCallSink, buildCallRecord } from "./calls";
import {
  type AiConfig,
  type AiTask,
  effortFor,
  modelFor,
  type ProviderConfig,
  providerChain,
} from "./config";
import { type ModelResolver, providerOptions, resolveModel } from "./providers";

/*
 * The one place the product talks to a model (SDD §10.1). Every call is
 * schema-shaped, deadline-bound, logged and toolless. Callers get either a
 * validated object or an error they can answer with the manual path, which is
 * why `AiDisabledError` and `AiUnavailableError` are distinct.
 */

/** AI is off, or no provider is configured. The caller uses its manual path. */
export class AiDisabledError extends Error {
  override name = "AiDisabledError";
  constructor(readonly reason: "disabled" | "session_off" | "not_configured") {
    super(
      reason === "not_configured"
        ? "no AI provider is configured"
        : reason === "session_off"
          ? "AI is switched off for this session"
          : "AI is switched off",
    );
  }
}

/** Every provider failed, or the breaker is open. */
export class AiUnavailableError extends Error {
  override name = "AiUnavailableError";
  constructor(
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`AI call failed: ${reason}`, options);
  }
}

export type RunOptions<T> = {
  task: AiTask;
  /** The output contract. The model never sees a tool, only this schema. */
  schema: z.ZodType<T>;
  /** Used by providers as the schema name; keep it stable for prompt caching. */
  schemaName?: string;
  system: string;
  prompt: string;
  planId?: string | null;
  signal?: AbortSignal;
  maxOutputTokens?: number;
};

export type RunResult<T> = { output: T; call: AiCallRecord };

export type StreamRun<T> = {
  /** Partial objects as they arrive, for the requirements list to fill in. */
  partials: AsyncIterable<DeepPartial<T>>;
  completed: Promise<RunResult<T>>;
};

export type RouterDeps = {
  config: AiConfig;
  sink?: AiCallSink;
  resolveModel?: ModelResolver;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called when a sink throws; logging never breaks a call. */
  onLogError?: (error: unknown) => void;
};

type Attempt<V> = {
  value: V;
  /** Resolves with the usage once the call is finished (after the stream drains). */
  settled: Promise<LanguageModelUsage | undefined>;
};

const BASE_BACKOFF_MS = 250;

function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

/** A short, safe reason code. Provider payloads may contain request data. */
export function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (error.name === "TimeoutError") return "timeout";
  const status = statusOf(error);
  if (status !== undefined) return `http_${status}`;
  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error)
  ) {
    return "invalid_output";
  }
  if (APICallError.isInstance(error)) return "api_error";
  return error.name === "Error" ? "call_failed" : error.name;
}

/** Only transport-level problems are worth another attempt (SDD §10.1). */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError") return true;
  const retryable = (error as { isRetryable?: unknown }).isRetryable;
  if (typeof retryable === "boolean") return retryable;
  const status = statusOf(error);
  if (status === undefined) return error.name === "TypeError";
  return status === 408 || status === 429 || status >= 500;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class AiRouter {
  private readonly deps: Required<
    Pick<RouterDeps, "now" | "random" | "sleep">
  > &
    RouterDeps;
  private failures: number[] = [];
  private openedAt: number | null = null;
  private probing = false;

  constructor(deps: RouterDeps) {
    this.deps = {
      now: () => Date.now(),
      random: () => Math.random(),
      sleep: defaultSleep,
      ...deps,
    };
  }

  get config(): AiConfig {
    return this.deps.config;
  }

  /** True when a call would be attempted right now. */
  available(): boolean {
    return (
      this.config.enabled &&
      providerChain(this.config).length > 0 &&
      !this.breakerOpen()
    );
  }

  breakerOpen(): boolean {
    if (this.openedAt === null) return false;
    const elapsed = this.deps.now() - this.openedAt;
    if (elapsed < this.config.breaker.cooldownMs) return true;
    // Cooled down: let exactly one call through to test the provider.
    this.openedAt = null;
    this.failures = [];
    this.probing = true;
    return false;
  }

  /** Closes the breaker; used by tests and by a manual "try again" action. */
  reset(): void {
    this.failures = [];
    this.openedAt = null;
    this.probing = false;
  }

  private recordSuccess(): void {
    this.failures = [];
    this.probing = false;
  }

  private recordFailure(): void {
    const now = this.deps.now();
    const { failures, windowMs } = this.config.breaker;
    this.failures = this.failures.filter((t) => now - t < windowMs);
    this.failures.push(now);
    if (this.probing || this.failures.length >= failures) {
      this.openedAt = now;
      this.probing = false;
    }
  }

  private async log(record: AiCallRecord): Promise<void> {
    if (!this.deps.sink) return;
    try {
      await this.deps.sink(record);
    } catch (error) {
      this.deps.onLogError?.(error);
    }
  }

  /**
   * Runs `operation` over the provider chain: up to `retries` extra attempts
   * on each provider for transport failures, then the next provider. Every
   * attempt is logged, successful or not.
   */
  private async withProviders<V>(
    task: AiTask,
    planId: string | null,
    signal: AbortSignal | undefined,
    operation: (
      provider: ProviderConfig,
      signal: AbortSignal,
    ) => Promise<Attempt<V>>,
  ): Promise<{ value: V; settled: Promise<AiCallRecord> }> {
    if (!this.config.enabled) throw new AiDisabledError("disabled");
    const chain = providerChain(this.config);
    if (chain.length === 0) throw new AiDisabledError("not_configured");
    if (this.breakerOpen()) throw new AiUnavailableError("circuit_open");

    let lastError: unknown;
    for (const [index, provider] of chain.entries()) {
      const fellBack = index > 0;
      const model = modelFor(provider, task);
      for (let attempt = 0; attempt <= this.config.retries; attempt++) {
        const started = this.deps.now();
        const timeout = AbortSignal.timeout(this.config.timeoutMs);
        const merged = signal ? AbortSignal.any([timeout, signal]) : timeout;
        try {
          const { value, settled } = await operation(provider, merged);
          const record = settled.then(
            (usage) => {
              this.recordSuccess();
              return buildCallRecord({
                task,
                provider: provider.id,
                model,
                latencyMs: this.deps.now() - started,
                fellBack,
                planId,
                usage,
              });
            },
            (error: unknown) => {
              this.recordFailure();
              return buildCallRecord({
                task,
                provider: provider.id,
                model,
                latencyMs: this.deps.now() - started,
                fellBack,
                planId,
                error: failureReason(error),
              });
            },
          );
          return {
            value,
            settled: record.then(async (r) => {
              await this.log(r);
              return r;
            }),
          };
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
          this.recordFailure();
          await this.log(
            buildCallRecord({
              task,
              provider: provider.id,
              model,
              latencyMs: this.deps.now() - started,
              fellBack,
              planId,
              error: failureReason(error),
            }),
          );
          if (!isRetryable(error)) break;
          if (attempt < this.config.retries) {
            await this.deps.sleep(this.backoff(attempt), signal);
          }
        }
      }
    }
    throw new AiUnavailableError(failureReason(lastError), {
      cause: lastError,
    });
  }

  /** Exponential backoff with full jitter on the upper half of the interval. */
  private backoff(attempt: number): number {
    const ceiling = BASE_BACKOFF_MS * 2 ** attempt;
    return Math.round(ceiling * (0.5 + this.deps.random() / 2));
  }

  private call<T>(
    options: RunOptions<T>,
    provider: ProviderConfig,
    signal: AbortSignal,
  ) {
    const resolve = this.deps.resolveModel ?? resolveModel;
    const effort = effortFor(this.config, options.task);
    const opts = providerOptions(provider, effort);
    return {
      model: resolve(provider, options.task),
      system: options.system,
      prompt: options.prompt,
      output: Output.object({
        schema: options.schema,
        ...(options.schemaName ? { name: options.schemaName } : {}),
      }),
      // OpenAI rejects temperature while a model is reasoning.
      ...(provider.id !== "openai" || effort === "none"
        ? { temperature: 0 }
        : {}),
      // Retries, timeouts and fallback are handled here so that every attempt
      // is logged to `ai_calls`.
      maxRetries: 0,
      abortSignal: signal,
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      ...(opts ? { providerOptions: opts } : {}),
    } as const;
  }

  /** One structured call. Throws `AiDisabledError` or `AiUnavailableError`. */
  async run<T>(options: RunOptions<T>): Promise<RunResult<T>> {
    const { value, settled } = await this.withProviders(
      options.task,
      options.planId ?? null,
      options.signal,
      async (provider, signal) => {
        const result = await generateText(this.call(options, provider, signal));
        return {
          value: result.output as T,
          settled: Promise.resolve(result.usage),
        };
      },
    );
    return { output: value, call: await settled };
  }

  /**
   * The same call, streamed. The promise resolves once a provider has
   * accepted the request, so a provider failure still falls back before the
   * UI shows anything.
   */
  async runStream<T>(options: RunOptions<T>): Promise<StreamRun<T>> {
    let resolveUsage: (usage: LanguageModelUsage | undefined) => void =
      () => {};
    let rejectUsage: (error: unknown) => void = () => {};
    const usage = new Promise<LanguageModelUsage | undefined>(
      (resolve, reject) => {
        resolveUsage = resolve;
        rejectUsage = reject;
      },
    );
    usage.catch(() => {});

    const { value, settled } = await this.withProviders(
      options.task,
      options.planId ?? null,
      options.signal,
      async (provider, signal) => {
        const result = streamText(this.call(options, provider, signal));
        const iterator = result.partialOutputStream[Symbol.asyncIterator]();
        // Waiting for the first chunk keeps a dead provider from becoming a
        // stream that fails halfway through the requirements list.
        const first = await iterator.next();
        const partials = (async function* () {
          try {
            if (!first.done) yield first.value as DeepPartial<T>;
            for (;;) {
              const next = await iterator.next();
              if (next.done) break;
              yield next.value as DeepPartial<T>;
            }
            resolveUsage(await result.usage);
          } catch (error) {
            rejectUsage(error);
            throw error;
          }
        })();
        return {
          value: { partials, output: () => result.output as Promise<T> },
          settled: usage,
        };
      },
    );

    return {
      partials: value.partials,
      completed: (async () => ({
        output: await value.output(),
        call: await settled,
      }))(),
    };
  }
}

export function createRouter(deps: RouterDeps): AiRouter {
  return new AiRouter(deps);
}

/** What the role functions need from a router. */
export type AiRunner = Pick<AiRouter, "available" | "run" | "runStream">;

/**
 * The per-session "AI off" toggle: the same router, except every call is
 * refused with `AiDisabledError("session_off")` so each caller takes its
 * manual path. The global switch is `AI_ENABLED`.
 */
export function forSession(
  router: AiRunner,
  session: { aiOff: boolean },
): AiRunner {
  if (!session.aiOff) return router;
  const refuse = () => Promise.reject(new AiDisabledError("session_off"));
  return { available: () => false, run: refuse, runStream: refuse };
}
