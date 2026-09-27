"use server";
import { LIVE_CASES, type LiveResult, runLiveCase } from "@/lib/bench-live";

/** Runs one live attack against the real engine. Only listed case IDs run. */
export async function runCase(id: string): Promise<LiveResult | null> {
  if (!LIVE_CASES.some((c) => c.id === id)) return null;
  return runLiveCase(id);
}
