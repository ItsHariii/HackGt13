import { OrderEvent } from "@cartel/acp";
import type { Json } from "@cartel/contracts/db";
import { verifyWebhook } from "@cartel/payments";
import { jsonResponse } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request: Request) {
  const secret = process.env.GREATHUB_WEBHOOK_SECRET;
  if (!secret) return jsonResponse({ error: "webhook_not_configured" }, 503);
  const raw = await request.text();
  if (
    raw.length > 65536 ||
    !(await verifyWebhook(secret, raw, request.headers.get("x-signature")))
  )
    return jsonResponse({ error: "invalid_signature" }, 401);
  try {
    const event = OrderEvent.parse(JSON.parse(raw));
    if (!event.data.contract || !Number.isFinite(Date.parse(event.created_at)))
      return jsonResponse({ error: "invalid_event" }, 400);
    const { data, error } = await createAdminClient().rpc(
      "srv_receive_greathub_event",
      { p_event: event as unknown as Json },
    );
    if (error) return jsonResponse({ error: "event_not_processed" }, 503);
    return jsonResponse({ status: data });
  } catch {
    return jsonResponse({ error: "invalid_event" }, 400);
  }
}
