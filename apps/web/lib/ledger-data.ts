import "server-only";
import { UUID } from "./catalog";
import type { LedgerRecord } from "./ledger";
import { ledgerRecord } from "./ledger-row";
import { createClient } from "./supabase/server";

/**
 * A saved plan's ledger through the person's own session (RLS). The payload
 * text is printed the way Postgres prints jsonb, so hashes can be recomputed as stored.
 */
export async function storedLedger(
  planId: string,
): Promise<{ title: string; records: LedgerRecord[] } | null> {
  if (!UUID.test(planId)) return null;
  const db = await createClient();
  if (!db) return null;
  const plan = await db
    .from("plans")
    .select("title")
    .eq("id", planId)
    .maybeSingle();
  if (!plan.data) return null;
  const { data, error } = await db
    .from("ledger_events")
    .select("seq,plan_id,actor,type,created_at,payload,prev_hash,hash")
    .eq("plan_id", planId)
    .order("seq");
  if (error) return null;
  return {
    title: plan.data.title,
    records: data.map(ledgerRecord),
  };
}
