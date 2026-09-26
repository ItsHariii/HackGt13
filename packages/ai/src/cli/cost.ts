import type { Database } from "@proofcart/contracts/db";
import { createClient } from "@supabase/supabase-js";
import { formatUsd, priceOf } from "../pricing";
import { readSpend } from "../supabase";
import { arg, loadLocalEnv } from "./env";

/*
 * `pnpm ai:cost [--since 24h|7d|2026-09-26]`: estimated spend so far from
 * `public.ai_calls`, grouped by model (SDD §10.4).
 */

function since(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d+)([hd])$/.exec(value);
  if (!m) return new Date(value).toISOString();
  const ms = Number(m[1]) * (m[2] === "h" ? 3_600_000 : 86_400_000);
  return new Date(Date.now() - ms).toISOString();
}

async function main(): Promise<void> {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required",
    );
    process.exit(1);
  }
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const from = since(arg("since"));
  const { rows, totalCostMicros } = await readSpend(
    db,
    from ? { since: from } : {},
  );

  console.log(`AI spend${from ? ` since ${from}` : ""} (${url})`);
  if (rows.length === 0) {
    console.log("  no calls logged");
    return;
  }
  console.log(
    `  ${"provider".padEnd(8)} ${"model".padEnd(28)} ${"calls".padStart(6)} ${"input".padStart(9)} ${"cached".padStart(9)} ${"output".padStart(9)} ${"cost".padStart(10)}  fallback/errors`,
  );
  for (const r of rows) {
    const unpriced =
      r.calls > 0 && !priceOf(r.model) ? "  (no price: cost shown as $0)" : "";
    console.log(
      `  ${r.provider.padEnd(8)} ${r.model.padEnd(28)} ${String(r.calls).padStart(6)} ${String(r.inputTokens).padStart(9)} ${String(r.cachedTokens).padStart(9)} ${String(r.outputTokens).padStart(9)} ${formatUsd(r.costUsdMicros).padStart(10)}  ${r.fellBack}/${r.errors}${unpriced}`,
    );
  }
  console.log(`  total ${formatUsd(totalCostMicros)}`);
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
