import { forbidden, isAdminRequest } from "@/lib/admin";
import { db } from "@/lib/supabase/admin";
import { drainOutbox } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Deliver due order webhooks now (`{"action":"drain"}`, also usable from a cron
 * with the bearer token) or put parked ones back in the queue (`"requeue"`).
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return forbidden();
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  let requeued = 0;
  if (body.action === "requeue") {
    const { data, error } = await db().rpc("requeue_failed_webhooks");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    requeued = data ?? 0;
  }
  const result = await drainOutbox();
  return Response.json({ requeued, ...result });
}
