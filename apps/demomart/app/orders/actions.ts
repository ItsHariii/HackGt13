"use server";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin";
import { pageOrigin } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getOrder, NEXT_STATUSES } from "@/lib/orders";
import { db } from "@/lib/supabase/admin";
import { deliverSoon, orderEvent } from "@/lib/webhooks";

/** Merchant-side status change; queues order_updated for ProofCart. */
export async function setOrderStatus(orderId: string, status: string) {
  if (!(await isAdminSession())) throw new Error("admin_required");
  const order = await getOrder(orderId);
  if (!order || !NEXT_STATUSES[order.status]?.includes(status))
    throw new Error("invalid_transition");
  const event = orderEvent(
    { ...order, status },
    "order_updated",
    await pageOrigin(),
  );
  const { error } = await db().rpc("update_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_event: event as never,
  });
  if (error) {
    logger.warn(
      { orderId, status, err: error.message },
      "order status change rejected",
    );
    throw new Error("status_change_failed");
  }
  deliverSoon();
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}
