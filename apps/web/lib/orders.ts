import "server-only";
import { formatMoneyText } from "@cartel/proof-engine";
import { formatStamp } from "./contract-view";
import { type StoredOrderRow, storedOrderView } from "./order-view";
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

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** The receipt page for a paid execution, through RLS. Null when no order row is visible. */
export async function receiptUrl(
  db: Db | null,
  executionId: string,
): Promise<string | null> {
  if (!db) return null;
  const { data } = await db
    .from("orders")
    .select("id")
    .eq("execution_id", executionId)
    .maybeSingle();
  return data ? `/orders/${data.id}` : null;
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

type Embedded<T> = T | T[] | null;
const one = <T>(v: Embedded<T> | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * A stored order as its paid receipt (design "Paid receipt"), through RLS.
 * Null when the viewer can't see the order.
 */
export async function storedReceipt(id: string) {
  const db = await createClient();
  if (!db) return null;
  const { data } = await db
    .from("orders")
    .select(
      "id,merchant_id,merchant_order_id,status,total_minor,currency,created_at,payment_executions!inner(rail,payment_instruments(brand,last4),contract_versions!inner(plan_id,version,body,body_hash,signed_at,proof_reports(summary)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  type Version = {
    plan_id: string;
    version: number;
    body: unknown;
    body_hash: string;
    signed_at: string | null;
    proof_reports: Embedded<{
      summary: { hard?: StoredOrderRow["hard"] } | null;
    }>;
  };
  const execution = one(
    data.payment_executions as unknown as Embedded<{
      rail: string | null;
      payment_instruments: Embedded<{
        brand: string | null;
        last4: string | null;
      }>;
      contract_versions: Embedded<Version>;
    }>,
  );
  const version = one(execution?.contract_versions);
  if (!execution || !version) return null;
  const { data: plan } = await db
    .from("plans")
    .select("title")
    .eq("id", version.plan_id)
    .maybeSingle();
  const row: StoredOrderRow = {
    id: data.id,
    merchantId: data.merchant_id,
    merchantOrderId: data.merchant_order_id,
    status: data.status,
    totalMinor: data.total_minor,
    currency: data.currency,
    createdAt: data.created_at,
    rail: execution.rail,
    card: one(execution.payment_instruments),
    planId: version.plan_id,
    planTitle: plan?.title ?? null,
    contractVersion: version.version,
    contractHash: version.body_hash,
    contractBody: version.body,
    signedAt: version.signed_at,
    hard: one(version.proof_reports)?.summary?.hard ?? null,
  };
  return { orderId: data.id, view: storedOrderView(row) };
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
