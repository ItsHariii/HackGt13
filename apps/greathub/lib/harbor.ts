import "server-only";
import type { CatchEntry } from "./catches";
import { db } from "./supabase/admin";

const CATCH_COLUMNS =
  "id, mutation, scenario, target, before, after, actor, created_at";

/** The most recent mutation-log rows, newest first. */
export async function recentCatches(limit = 50): Promise<CatchEntry[]> {
  const { data, error } = await db()
    .from("mutation_log")
    .select(CATCH_COLUMNS)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`mutation log query failed: ${error.message}`);
  return (data ?? []) as unknown as CatchEntry[];
}

/** The latest catch per SKU, since the last reset. */
export function latestBySku(
  catches: readonly CatchEntry[],
): Map<string, CatchEntry> {
  const out = new Map<string, CatchEntry>();
  for (const c of catches) {
    if (c.mutation === "reset") break;
    const sku = c.target.sku;
    if (sku && !out.has(sku)) out.set(sku, c);
  }
  return out;
}

/**
 * Activity per day for the tide chart: mutations plus orders, for the last
 * `days` days ending today (UTC), oldest first.
 */
export async function tideCounts(days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [log, orders] = await Promise.all([
    db().from("mutation_log").select("created_at").gte("created_at", since),
    db().from("orders").select("created_at").gte("created_at", since),
  ]);
  if (log.error || orders.error) throw new Error("tide query failed");
  const counts = new Array<number>(days).fill(0);
  const today = Math.floor(Date.now() / 86_400_000);
  for (const row of [...(log.data ?? []), ...(orders.data ?? [])]) {
    const day = Math.floor(Date.parse(row.created_at) / 86_400_000);
    const i = days - 1 - (today - day);
    if (i >= 0 && i < days) counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}
