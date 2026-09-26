import { verifyQueueWake } from "@cartel/evidence/supabase";
import { isConfigured } from "@cartel/platform/env";
import { requestId } from "@cartel/platform/request-id";
import { drainMandates } from "@/lib/mandates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Woken by cron `mandates-tick` (0010_jobs.sql) with an HMAC over "{timestamp}.mandate_eval".
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const secret = process.env.INTERNAL_QUEUE_HMAC_SECRET;
  if (!isConfigured(secret))
    return Response.json(
      { error: "Queue worker is not configured" },
      { status: 503 },
    );
  if (!(await verifyQueueWake(request.headers, "mandate_eval", secret)))
    return new Response(null, { status: 401 });
  const totals = await drainMandates(id);
  return Response.json(totals, {
    headers: { "Cache-Control": "no-store", "x-request-id": id },
  });
}
