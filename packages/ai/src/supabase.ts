import type { Database } from "@proofcart/contracts/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCallRecord, AiCallSink } from "./calls";

/*
 * `public.ai_calls` is server-only (0013_ops.sql revokes it from anon and
 * authenticated), so this sink needs the secret key. It lives behind its own
 * export path to keep Supabase out of pure consumers.
 */

export type Db = SupabaseClient<Database>;

type Insert = Database["public"]["Tables"]["ai_calls"]["Insert"];

export function toInsert(record: AiCallRecord): Insert {
  return {
    task: record.task,
    provider: record.provider,
    model: record.model,
    input_tokens: record.inputTokens,
    cached_tokens: record.cachedTokens,
    output_tokens: record.outputTokens,
    cost_usd_micros: record.costUsdMicros,
    latency_ms: record.latencyMs,
    fell_back: record.fellBack,
    error: record.error,
    plan_id: record.planId,
    created_at: record.at,
  };
}

/** Writes one row per call. Errors are handed to the router's log handler. */
export function supabaseAiSink(db: Db): AiCallSink {
  return async (record) => {
    const { error } = await db.from("ai_calls").insert(toInsert(record));
    if (error) throw new Error(`ai_calls insert failed: ${error.code}`);
  };
}

export type SpendRow = {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsdMicros: number;
  fellBack: number;
  errors: number;
};

/** Spend so far, grouped by model. Used by `pnpm ai:cost`. */
export async function readSpend(
  db: Db,
  options: { since?: string; limit?: number } = {},
): Promise<{ rows: SpendRow[]; totalCostMicros: number }> {
  let query = db
    .from("ai_calls")
    .select(
      "provider, model, input_tokens, cached_tokens, output_tokens, cost_usd_micros, fell_back, error",
    )
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 10_000);
  if (options.since) query = query.gte("created_at", options.since);

  const { data, error } = await query;
  if (error?.code === "PGRST205") {
    throw new Error(
      "ai_calls does not exist in this database; apply supabase/migrations/0013_ops.sql",
    );
  }
  if (error) throw new Error(`ai_calls read failed: ${error.code}`);

  const byModel = new Map<string, SpendRow>();
  for (const row of data ?? []) {
    const key = `${row.provider}:${row.model}`;
    const current: SpendRow = byModel.get(key) ?? {
      provider: row.provider,
      model: row.model,
      calls: 0,
      inputTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
      costUsdMicros: 0,
      fellBack: 0,
      errors: 0,
    };
    current.calls += 1;
    current.inputTokens += row.input_tokens;
    current.cachedTokens += row.cached_tokens;
    current.outputTokens += row.output_tokens;
    current.costUsdMicros += row.cost_usd_micros;
    if (row.fell_back) current.fellBack += 1;
    if (row.error) current.errors += 1;
    byModel.set(key, current);
  }

  const rows = [...byModel.values()].sort(
    (a, b) => b.costUsdMicros - a.costUsdMicros,
  );
  return {
    rows,
    totalCostMicros: rows.reduce((sum, r) => sum + r.costUsdMicros, 0),
  };
}
