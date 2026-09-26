import "server-only";
import type { ContractRef, OrderEvent } from "@proofcart/acp";
import { isConfigured, isHttpUrl } from "@proofcart/platform/env";
import { after } from "next/server";
import { logger } from "./logger";
import { db } from "./supabase/admin";
import type { Tables } from "./supabase/db";
import { signWebhook } from "./webhook-signature";

type OrderRow = Tables<{ schema: "demomart" }, "orders">;

export function orderEvent(
  order: OrderRow,
  type: OrderEvent["type"],
  origin: string,
): OrderEvent {
  const payment = (order.payment ?? {}) as {
    rail?: string;
    transactionId?: string | null;
  };
  return {
    type,
    event_id: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
    created_at: new Date().toISOString(),
    data: {
      type: "order",
      checkout_session_id: order.checkout_session_id,
      order_id: order.id,
      permalink_url: `${origin}/orders/${order.id}`,
      status: order.status as OrderEvent["data"]["status"],
      total_minor: order.total_minor,
      currency: order.currency,
      contract: (order.contract_ref as unknown as ContractRef | null) ?? null,
      payment: {
        rail: payment.rail ?? "unknown",
        transaction_id: payment.transactionId ?? null,
      },
    },
  };
}

function target() {
  const url = process.env.PROOFCART_WEBHOOK_URL;
  const secret = process.env.DEMOMART_WEBHOOK_SECRET;
  return isHttpUrl(url) && isConfigured(secret) ? { url, secret } : null;
}

async function deliver(event: {
  id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
}) {
  const t = target();
  if (!t) return { ok: false, error: "webhook target not configured" };
  const body = JSON.stringify(event.payload);
  try {
    const res = await fetch(t.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-event-id": event.event_id,
        "x-event-type": event.event_type,
        "x-signature": await signWebhook(
          t.secret,
          body,
          Math.floor(Date.now() / 1000),
        ),
        "user-agent": "DemoMart-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      error:
        (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message,
    };
  }
}

/** Deliver every due event once. Returns how many were attempted. */
export async function drainOutbox(
  limit = 20,
): Promise<{ attempted: number; delivered: number }> {
  const { data, error } = await db().rpc("claim_webhooks", { p_limit: limit });
  if (error) throw new Error(`claim_webhooks failed: ${error.message}`);
  let delivered = 0;
  await Promise.all(
    (data ?? []).map(async (event) => {
      const result = await deliver(event);
      if (result.ok) delivered++;
      else
        logger.warn(
          {
            eventId: event.event_id,
            attempt: event.attempts,
            err: result.error,
          },
          "webhook delivery failed",
        );
      await db().rpc("webhook_result", {
        p_id: event.id,
        p_ok: result.ok,
        ...(result.error ? { p_error: result.error } : {}),
      });
    }),
  );
  return { attempted: data?.length ?? 0, delivered };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After the response: deliver now, then follow the 1 s / 5 s / 30 s retry
 * schedule for up to 45 s. Anything left is picked up by the next drain
 * (another order, or POST /api/internal/webhooks/drain).
 */
export function deliverSoon() {
  after(async () => {
    const deadline = Date.now() + 45_000;
    try {
      while (Date.now() < deadline) {
        await drainOutbox();
        const { data } = await db()
          .from("webhook_outbox")
          .select("next_attempt_at")
          .is("delivered_at", null)
          .is("failed_at", null)
          .order("next_attempt_at")
          .limit(1)
          .maybeSingle();
        if (!data) return;
        const wait = Date.parse(data.next_attempt_at) - Date.now();
        if (Date.now() + wait > deadline) return;
        await sleep(Math.max(wait, 50));
      }
    } catch (e) {
      logger.error({ err: (e as Error).message }, "webhook drain failed");
    }
  });
}
