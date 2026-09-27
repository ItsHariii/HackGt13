import "server-only";
import { formatMoneyText } from "@cartel/proof-engine";
import { formatStamp } from "./contract-view";
import { createClient } from "./supabase/server";

export type OrderRow = {
  id: string;
  title: string;
  merchant: string;
  total: string;
  status: string;
  when: string;
  href: string;
  demo: boolean;
};

const STATUS: Record<string, string> = {
  created: "Created",
  manual_review: "Manual review",
  confirmed: "Confirmed",
  canceled: "Canceled",
  shipped: "Shipped",
  fulfilled: "Delivered",
};

/** The signed-in person's orders, through RLS. Empty without a database or session. */
export async function storedOrders(): Promise<OrderRow[]> {
  const db = await createClient();
  if (!db) return [];
  const { data: user } = await db.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await db
    .from("orders")
    .select(
      "id,merchant_id,merchant_order_id,status,total_minor,currency,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((o) => ({
    id: o.id,
    title: `Order ${o.merchant_order_id}`,
    merchant:
      o.merchant_id === "greathub" ? "GreatHub (test merchant)" : o.merchant_id,
    total: formatMoneyText(o.total_minor, o.currency),
    status: STATUS[o.status] ?? o.status,
    when: formatStamp(o.created_at),
    href: `/orders/${o.id}`,
    demo: false,
  }));
}

export async function storedOrder(id: string) {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db
    .from("orders")
    .select(
      "id,merchant_id,merchant_order_id,status,total_minor,currency,created_at,events",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export type DeliveryScanRow = {
  gtin: string;
  matched: string | null;
  at: string;
  seq: number;
};

/**
 * A stored order's signed contract and its delivery scans, through RLS
 * (TASKS T15.3). Null when the viewer can't see the order.
 */
export async function storedOrderDelivery(id: string) {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db
    .from("orders")
    .select(
      "id,payment_executions!inner(contract_versions!inner(plan_id,version,body,body_hash))",
    )
    .eq("id", id)
    .maybeSingle();
  const version = (
    data?.payment_executions as unknown as {
      contract_versions: {
        plan_id: string;
        version: number;
        body: {
          items?: { title: string; sku: string; gtin?: string; qty: number }[];
        };
        body_hash: string;
      } | null;
    } | null
  )?.contract_versions;
  if (!data || !version) return null;
  const { data: events } = await db
    .from("ledger_events")
    .select("seq,type,payload,created_at")
    .eq("plan_id", version.plan_id)
    .in("type", ["delivery.matched", "delivery.mismatched"])
    .order("seq");
  const scans: DeliveryScanRow[] = (events ?? []).flatMap((e) => {
    const p = e.payload as Record<string, unknown>;
    if (p.orderId !== id || typeof p.gtin !== "string") return [];
    return [
      {
        gtin: p.gtin,
        matched:
          e.type === "delivery.matched" && typeof p.sku === "string"
            ? p.sku
            : null,
        at: formatStamp(e.created_at),
        seq: e.seq,
      },
    ];
  });
  return {
    planId: version.plan_id,
    version: version.version,
    hash: version.body_hash,
    items: (version.body.items ?? []).map((i) => ({
      title: i.title,
      sku: i.sku,
      gtin: i.gtin ?? null,
      qty: i.qty,
    })),
    scans,
  };
}
