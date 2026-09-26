import type { ProviderId } from "./config";

/*
 * Token accounting (SDD §10.4). Prices are US dollars per million tokens, as
 * published on 2026-09-26. A price in dollars per million tokens is also the
 * cost in micro-dollars per token, so the arithmetic below stays in integers.
 */

export type ModelPrice = {
  input: number;
  /** Price of a cached input token; the same as `input` when a provider has no cache. */
  cached: number;
  output: number;
};

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "gpt-6-sol": { input: 2, cached: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "muse-spark-1.3": { input: 1.25, cached: 1.25, output: 4.25 },
  "muse-spark-1.3-contributor": { input: 0.1, cached: 0.1, output: 0.2 },
};

export type TokenCounts = {
  /** Input tokens that were not served from the provider's cache. */
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
};

export function priceOf(model: string): ModelPrice | null {
  return MODEL_PRICES[model] ?? null;
}

/**
 * Estimated cost in micro-dollars. An unpriced model (a renamed or newly
 * released one) costs 0 rather than a guess; `pnpm ai:cost` lists it so the
 * price table can be corrected.
 */
export function estimateCostMicros(model: string, tokens: TokenCounts): number {
  const price = priceOf(model);
  if (!price) return 0;
  const micros =
    tokens.inputTokens * price.input +
    tokens.cachedTokens * price.cached +
    tokens.outputTokens * price.output;
  return Math.max(0, Math.round(micros));
}

export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

/** Providers that bill cached input tokens at a lower rate. */
export const CACHING_PROVIDERS: readonly ProviderId[] = ["openai"];
