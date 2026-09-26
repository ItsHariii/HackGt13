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

export type StoredMandate = {
  id: string;
  planId: string;
  version: number;
  trigger: string;
  notAfter: string;
  status:
    | "armed"
    | "fired_executed"
    | "fired_blocked"
    | "expired"
    | "cancelled";
  nextCheck: string | null;
};

/** The person's standing mandates, through RLS. */
export async function storedMandates(): Promise<StoredMandate[]> {
  const db = await createClient();
  if (!db) return [];
  const { data: user } = await db.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await db
    .from("mandates")
    .select(
      "id,trigger,not_after,status,next_check_at,contract_versions(plan_id,version)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((m) => {
    const t = m.trigger as {
      type?: string;
      sku?: string;
      amountMinor?: number;
      every?: string;
    };
    return {
      id: m.id,
      planId: m.contract_versions?.plan_id ?? "",
      version: m.contract_versions?.version ?? 0,
      trigger:
        t.type === "price_lte" && t.amountMinor !== undefined
          ? `${t.sku} ≤ ${formatMoneyText(t.amountMinor, "USD")}`
          : t.type === "back_in_stock"
            ? `${t.sku} back in stock`
            : `Every ${t.every ?? "period"}`,
      notAfter: formatStamp(m.not_after),
      status: m.status,
      nextCheck: m.status === "armed" ? formatStamp(m.next_check_at) : null,
    };
  });
}
