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
