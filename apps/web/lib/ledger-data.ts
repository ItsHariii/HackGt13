import "server-only";
import { UUID } from "./catalog";
import { jsonbText, type LedgerRecord } from "./ledger";
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
    records: data.map((e) => ({
      seq: e.seq,
      planId: e.plan_id,
      actor: e.actor,
      type: e.type,
      // PostgREST returns ISO with an offset; the hash uses UTC microseconds.
      createdAt: `${new Date(e.created_at).toISOString().slice(0, 19)}.${(e.created_at.match(/\.(\d+)/)?.[1] ?? "0").padEnd(6, "0").slice(0, 6)}Z`,
      payloadText: jsonbText(e.payload as Record<string, unknown>),
      prevHash: e.prev_hash,
      hash: e.hash,
    })),
  };
}
