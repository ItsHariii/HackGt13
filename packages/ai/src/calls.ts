import type { LanguageModelUsage } from "ai";
import type { AiTask, ProviderId } from "./config";
import { estimateCostMicros, type TokenCounts } from "./pricing";

/*
 * One row per model call (SDD §10.1, `public.ai_calls`). The record is written
 * for failures too, so a demo that runs out of credit or hits a renamed model
 * leaves a trail instead of a silent fallback.
 */

export type AiCallRecord = TokenCounts & {
  task: AiTask;
  provider: ProviderId;
  model: string;
  costUsdMicros: number;
  latencyMs: number;
  /** True when this call ran on the fallback provider. */
  fellBack: boolean;
  /** A short reason ("timeout", "http_429"); never a provider payload. */
  error: string | null;
  planId: string | null;
  at: string;
};

export type AiCallSink = (record: AiCallRecord) => void | Promise<void>;

const ZERO: TokenCounts = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };

/**
 * Splits the SDK's usage into billable buckets. `inputTokens` counts every
 * input token including cached ones, so the cached part is subtracted.
 */
export function usageCounts(
  usage: LanguageModelUsage | undefined,
): TokenCounts {
  if (!usage) return { ...ZERO };
  const total = usage.inputTokens ?? 0;
  const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  return {
    inputTokens: Math.max(0, total - cached),
    cachedTokens: cached,
    outputTokens: usage.outputTokens ?? 0,
  };
}

export type CallFacts = {
  task: AiTask;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  fellBack: boolean;
  planId?: string | null;
  error?: string | null;
  usage?: LanguageModelUsage | undefined;
  at?: string;
};

export function buildCallRecord(facts: CallFacts): AiCallRecord {
  const tokens = usageCounts(facts.usage);
  return {
    task: facts.task,
    provider: facts.provider,
    model: facts.model,
    ...tokens,
    costUsdMicros: estimateCostMicros(facts.model, tokens),
    latencyMs: Math.max(0, Math.round(facts.latencyMs)),
    fellBack: facts.fellBack,
    error: facts.error ?? null,
    planId: facts.planId ?? null,
    at: facts.at ?? new Date().toISOString(),
  };
}

export type MemorySink = {
  sink: AiCallSink;
  records: AiCallRecord[];
  totalCostMicros(): number;
};

/** Collects records in memory: used by the evals, the tests and `ai:smoke`. */
export function memorySink(): MemorySink {
  const records: AiCallRecord[] = [];
  return {
    records,
    sink: (record) => {
      records.push(record);
    },
    totalCostMicros: () => records.reduce((sum, r) => sum + r.costUsdMicros, 0),
  };
}

/** Runs every sink and never lets logging break a call. */
export function fanOut(
  sinks: readonly AiCallSink[],
  onError?: (error: unknown) => void,
): AiCallSink {
  return async (record) => {
    for (const sink of sinks) {
      try {
        await sink(record);
      } catch (error) {
        onError?.(error);
      }
    }
  };
}
