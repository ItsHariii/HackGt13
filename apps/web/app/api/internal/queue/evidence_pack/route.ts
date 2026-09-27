import {
  drainQueue,
  supabaseQueueStore,
  verifyQueueWake,
} from "@cartel/evidence/supabase";
import { isConfigured } from "@cartel/platform/env";
import { requestId } from "@cartel/platform/request-id";
import { EVIDENCE_PACK_QUEUE, generateStoredPack } from "@/lib/evidence-pack";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUEUE = "evidence_pack";
const BUDGET_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Woken after each new order and by cron `evidence-packs-tick` (0016_post_purchase.sql),
// with an HMAC over "{timestamp}.evidence_pack".
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
  const queue = supabaseQueueStore(db);
  const handle = async (message: unknown) => {
    const orderId = (message as { orderId?: unknown } | null)?.orderId;
    if (typeof orderId !== "string" || !UUID.test(orderId)) return "skipped";
    return (await generateStoredPack(orderId, db)) ? "handled" : "skipped";
  };
  const totals = { handled: 0, skipped: 0, failed: 0, deadLettered: 0 };
  const started = Date.now();
  while (Date.now() - started < BUDGET_MS) {
    const r = await drainQueue(queue, EVIDENCE_PACK_QUEUE, handle, {
      // Rendering a PDF and uploading takes a few seconds; keep batches small.
      batch: 3,
      visibilityS: 120,
      onError: (err, m) =>
        logger.warn(
          { requestId: id, msgId: m.msgId, readCt: m.readCt, err },
          "evidence pack failed",
        ),
    });
    for (const k of Object.keys(totals) as (keyof typeof totals)[])
      totals[k] += r[k];
    if (r.handled + r.skipped + r.deadLettered === 0) break;
  }
  logger.info(
    { requestId: id, ...totals, ms: Date.now() - started },
    "evidence packs drained",
  );
  return Response.json(totals, {
    headers: { "Cache-Control": "no-store", "x-request-id": id },
  });
}
