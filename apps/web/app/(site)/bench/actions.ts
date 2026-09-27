"use server";
import { LIVE_CASES, type LiveResult, runLiveCase } from "@/lib/bench-live";
import { limitCurrentRequest } from "@/lib/rate-limit";

export type RunCaseResult =
  | LiveResult
  | { error: "rate_limited"; retryAfterMs: number }
  | null;

/** Runs one live attack against the real engine. Only listed case IDs run. */
export async function runCase(id: string): Promise<RunCaseResult> {
  if (!LIVE_CASES.some((c) => c.id === id)) return null;
  const limit = await limitCurrentRequest("bench_run");
  if (!limit.allowed)
    return { error: "rate_limited", retryAfterMs: limit.retryAfterMs };
  return runLiveCase(id);
}
