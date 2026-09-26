import {
  drainQueue,
  FACT_REFRESH_QUEUE,
  factRefreshHandler,
  supabaseQueueStore,
  verifyQueueWake,
} from "@proofcart/evidence/supabase";
import { isConfigured } from "@proofcart/platform/env";
import { requestId } from "@proofcart/platform/request-id";
import { ALL_PACKS, demomartAdapter, evidenceStore } from "@/lib/evidence";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUEUE = "fact_refresh";
const BUDGET_MS = 20_000;

// Woken by cron `offers-refresh` (0010_jobs.sql) with an HMAC over "{timestamp}.fact_refresh".
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const secret = process.env.INTERNAL_QUEUE_HMAC_SECRET;
  if (!isConfigured(secret))
    return Response.json(
      { error: "Queue worker is not configured" },
      { status: 503 },
    );
  if (!(await verifyQueueWake(request.headers, QUEUE, secret)))
    return new Response(null, { status: 401 });

  const db = createAdminClient();
  const store = evidenceStore(db);
  const handle = factRefreshHandler({
    db,
    store,
    packs: ALL_PACKS,
    demomart: await demomartAdapter(store),
  });
  const queue = supabaseQueueStore(db);
  const totals = { handled: 0, skipped: 0, failed: 0, deadLettered: 0 };
  const started = Date.now();
  while (Date.now() - started < BUDGET_MS) {
    const r = await drainQueue(queue, FACT_REFRESH_QUEUE, handle, {
      onError: (err, m) =>
        logger.warn(
          { requestId: id, msgId: m.msgId, readCt: m.readCt, err },
          "fact refresh failed",
        ),
    });
    for (const k of Object.keys(totals) as (keyof typeof totals)[])
      totals[k] += r[k];
    // Failed messages stay invisible until their timeout, so an all-failed batch means the queue is drained for now.
    if (r.handled + r.skipped + r.deadLettered === 0) break;
  }
  logger.info(
    { requestId: id, ...totals, ms: Date.now() - started },
    "fact refresh drained",
  );
  return Response.json(totals, {
    headers: { "Cache-Control": "no-store", "x-request-id": id },
  });
}
