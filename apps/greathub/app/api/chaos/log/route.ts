import { forbidden, isAdminRequest } from "@/lib/admin";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Mutation log plus webhook outbox health, polled by the panel every second. */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return forbidden();
  const [log, outbox] = await Promise.all([
    db()
      .from("mutation_log")
      .select(
        "id, mutation, scenario, target, before, after, actor, created_at",
      )
      .order("id", { ascending: false })
      .limit(50),
    db()
      .from("webhook_outbox")
      .select(
        "event_id, event_type, order_id, attempts, delivered_at, failed_at, last_error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (log.error || outbox.error)
    return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json(
    { entries: log.data, webhooks: outbox.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
