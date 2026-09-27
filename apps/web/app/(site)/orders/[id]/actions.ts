"use server";
import {
  type DeliveryResult,
  deliveryPayload,
  matchDelivery,
} from "@cartel/evidence-pack";
import { revalidatePath } from "next/cache";
import { UUID, userId } from "@/lib/catalog";
import { flagshipOrderRecord, storedOrderContract } from "@/lib/evidence-pack";
import { FLAGSHIP_ORDER } from "@/lib/flagship";
import { logger } from "@/lib/logger";
import { storedOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeliveryCheck =
  | {
      ok: true;
      result: Exclude<DeliveryResult, { outcome: "invalid" }>;
      /** The ledger event it was recorded as; null for the demo order. */
      ledgerSeq: number | null;
      demo: boolean;
    }
  | { ok: false; error: "invalid_code" | "not_found" | "unavailable" };

/**
 * T15.3: compares a scanned or typed GTIN with the signed contract and
 * records `delivery.matched` or `delivery.mismatched` on the plan's ledger.
 * The demo order is checked but not recorded.
 */
export async function checkDelivery(
  orderId: string,
  code: string,
  method: "scan" | "typed",
): Promise<DeliveryCheck> {
  if (method !== "scan" && method !== "typed")
    return { ok: false, error: "invalid_code" };
  if (orderId === FLAGSHIP_ORDER) {
    const r = await flagshipOrderRecord();
    const result = matchDelivery(r.contract.items, String(code).slice(0, 64));
    if (result.outcome === "invalid")
      return { ok: false, error: "invalid_code" };
    return { ok: true, result, ledgerSeq: null, demo: true };
  }
  if (!UUID.test(orderId)) return { ok: false, error: "not_found" };
  try {
    // RLS: the order is visible only to its owner.
    const [order, user] = await Promise.all([storedOrder(orderId), userId()]);
    if (!order) return { ok: false, error: "not_found" };
    const db = createAdminClient();
    const contract = await storedOrderContract(order.id, db);
    if (!contract) return { ok: false, error: "not_found" };
    const result = matchDelivery(contract.items, String(code).slice(0, 64));
    if (result.outcome === "invalid")
      return { ok: false, error: "invalid_code" };
    const { data, error } = await db.rpc("srv_record_delivery", {
      p_order: order.id,
      p_user: user,
      p_type:
        result.outcome === "matched"
          ? "delivery.matched"
          : "delivery.mismatched",
      p_payload: deliveryPayload(result, order.id, method),
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/orders/${order.id}`);
    return {
      ok: true,
      result,
      ledgerSeq: (data as { seq?: number } | null)?.seq ?? null,
      demo: false,
    };
  } catch (err) {
    logger.warn({ err, orderId }, "delivery check failed");
    return { ok: false, error: "unavailable" };
  }
}
