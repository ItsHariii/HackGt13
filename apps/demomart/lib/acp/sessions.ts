import "server-only";
import type {
  Address,
  Buyer,
  CheckoutSession,
  ContractRef,
  CreateSessionRequest,
  FulfillmentOption,
  Item,
  LineItem,
  Message,
  SessionStatus,
  Total,
  UpdateSessionRequest,
} from "@proofcart/acp";
import { toBase64Url, utf8 } from "@proofcart/tap";
import {
  type CartVariant,
  getCartVariants,
  getStorePolicies,
} from "../catalog";
import { formatMinor } from "../money";
import { priceCart } from "../pricing";
import { db } from "../supabase/admin";
import type { Tables } from "../supabase/db";
import { conflict, invalid, notFound } from "./http";

export type SessionRow = Tables<{ schema: "demomart" }, "checkout_sessions">;

export const SHIPPING_OPTION_ID = "ship_standard";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export function randomId(prefix: string, length = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % 62];
  return out;
}

function addDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function revisionTag(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(parts.join("|")));
  return `r_${toBase64Url(new Uint8Array(digest)).slice(0, 16)}`;
}

export interface SessionView {
  session: CheckoutSession;
  variants: Map<string, CartVariant>;
  totalMinor: number;
}

/**
 * The authoritative ACP view of a session. Open sessions are priced live from the
 * current catalog (so a Chaos Panel mutation shows up on the next GET); completed
 * and canceled ones return the snapshot frozen at that moment.
 */
export async function renderSession(
  row: SessionRow,
  origin: string,
  now = new Date(),
): Promise<SessionView> {
  if (
    (row.status === "completed" || row.status === "canceled") &&
    row.snapshot
  ) {
    const session = row.snapshot as unknown as CheckoutSession;
    const total = session.totals.find((t) => t.type === "total")?.amount ?? 0;
    return {
      session: { ...session, ...(await orderLink(row, origin)) },
      variants: new Map(),
      totalMinor: total,
    };
  }

  const items = (row.items as unknown as Item[]) ?? [];
  const [variants, policies] = await Promise.all([
    getCartVariants(items.map((i) => i.id)),
    getStorePolicies(),
  ]);
  const messages: Message[] = [];
  const known: { item: Item; variant: CartVariant; index: number }[] = [];
  items.forEach((item, index) => {
    const variant = variants.get(item.id);
    if (!variant) {
      messages.push({
        type: "error",
        code: "invalid",
        param: `$.items[${index}]`,
        content_type: "plain",
        content: `Unknown item ${item.id}.`,
      });
    } else {
      known.push({ item, variant, index });
    }
  });

  const priced = priceCart(
    known.map(({ item, variant }) => ({
      unitPriceMinor: variant.offer.priceMinor,
      quantity: item.quantity,
      shippingFeeMinor: variant.offer.shippingFeeMinor,
    })),
    {
      shippingFlatMinor: policies.shipping.flatMinor,
      taxRateBps: policies.tax.rateBps,
    },
  );

  const lineItems: LineItem[] = known.map(({ item, variant }, i) => {
    const amounts = priced.lines[i];
    const o = variant.offer;
    if (o.availability === "out_of_stock" || item.quantity > o.stock) {
      messages.push({
        type: "error",
        code: "out_of_stock",
        param: `$.line_items[${i}]`,
        content_type: "plain",
        content:
          o.availability === "out_of_stock"
            ? `${variant.title} is out of stock.`
            : `Only ${o.stock} of ${variant.title} left.`,
      });
    }
    if (o.subscription) {
      messages.push({
        type: "info",
        param: `$.line_items[${i}]`,
        content_type: "plain",
        content: `${variant.title} renews every ${o.subscription.every.replace(/^P(\d+)D$/, "$1 days")} at ${formatMinor(o.subscription.priceMinor)}.`,
      });
    }
    if (o.finalSale) {
      messages.push({
        type: "info",
        param: `$.line_items[${i}]`,
        content_type: "plain",
        content: `${variant.title} is final sale and can't be returned.`,
      });
    }
    return {
      id: `li_${variant.sku}`,
      item: {
        id: variant.sku,
        quantity: item.quantity,
        x_proofcart: {
          title: variant.title,
          seller_id: o.seller.id,
          gtin: variant.gtin,
          mpn: variant.mpn,
          ships_gtin: variant.shipsAs?.gtin ?? variant.gtin,
          final_sale: o.finalSale,
          return_policy: o.returnPolicy.terms,
          pack_size: o.packSize,
          subscription: o.subscription,
          availability: o.availability,
          delivery: {
            min_days: o.deliveryMinDays,
            max_days: o.deliveryMaxDays,
          },
          spec_url: `${origin}/p/${variant.product.slug}?sku=${encodeURIComponent(variant.sku)}`,
          offer_id: o.id,
          offer_revision: o.revision,
        },
      },
      base_amount: amounts?.baseMinor ?? 0,
      discount: amounts?.discountMinor ?? 0,
      subtotal: amounts?.subtotalMinor ?? 0,
      tax: amounts?.taxMinor ?? 0,
      total: amounts?.totalMinor ?? 0,
    };
  });

  const fulfillmentOptions: FulfillmentOption[] =
    known.length === 0
      ? []
      : [
          {
            type: "shipping",
            id: SHIPPING_OPTION_ID,
            title: policies.shipping.label,
            carrier: "DemoMart Freight (fictional)",
            earliest_delivery_time: addDays(
              now,
              Math.max(...known.map((k) => k.variant.offer.deliveryMinDays)),
            ),
            latest_delivery_time: addDays(
              now,
              Math.max(...known.map((k) => k.variant.offer.deliveryMaxDays)),
            ),
            subtotal: priced.fulfillmentMinor,
            tax: 0,
            total: priced.fulfillmentMinor,
          },
        ];

  if (!row.fulfillment_address) {
    messages.push({
      type: "error",
      code: "missing",
      param: "$.fulfillment_address",
      content_type: "plain",
      content: "Add a shipping address.",
    });
  }

  const totals: Total[] = [
    {
      type: "items_base_amount",
      display_text: "Item(s) total",
      amount: priced.itemsBaseMinor,
    },
    {
      type: "subtotal",
      display_text: "Subtotal",
      amount: priced.subtotalMinor,
    },
    {
      type: "fulfillment",
      display_text: policies.shipping.label,
      amount: priced.fulfillmentMinor,
    },
    { type: "tax", display_text: policies.tax.label, amount: priced.taxMinor },
    { type: "fee", display_text: "Fees", amount: priced.feeMinor },
    { type: "total", display_text: "Total", amount: priced.totalMinor },
  ];

  const status: SessionStatus = messages.some((m) => m.type === "error")
    ? "not_ready_for_payment"
    : "ready_for_payment";

  const session: CheckoutSession = {
    id: row.id,
    ...(row.buyer ? { buyer: row.buyer as unknown as Buyer } : {}),
    payment_provider: {
      provider: "proofcart",
      supported_payment_methods: ["card"],
    },
    status: row.status === "canceled" ? "canceled" : status,
    currency: "USD",
    line_items: lineItems,
    ...(row.fulfillment_address
      ? { fulfillment_address: row.fulfillment_address as unknown as Address }
      : {}),
    fulfillment_options: fulfillmentOptions,
    ...(row.fulfillment_option_id && fulfillmentOptions.length
      ? { fulfillment_option_id: row.fulfillment_option_id }
      : {}),
    totals,
    messages,
    links: [
      { type: "terms_of_use", url: `${origin}/policies#terms` },
      { type: "privacy_policy", url: `${origin}/policies#privacy` },
      { type: "seller_shop_policies", url: `${origin}/policies#returns` },
    ],
    x_proofcart: {
      contract: (row.contract_ref as unknown as ContractRef | null) ?? null,
      revision: await revisionTag([
        ...known.map(
          (k) =>
            `${k.variant.sku}:${k.variant.offer.revision}:${k.item.quantity}`,
        ),
        String(priced.totalMinor),
        row.updated_at,
      ]),
    },
  };
  return { session, variants, totalMinor: priced.totalMinor };
}

async function orderLink(row: SessionRow, origin: string) {
  if (row.status !== "completed") return {};
  const { data } = await db()
    .from("orders")
    .select("id")
    .eq("checkout_session_id", row.id)
    .maybeSingle();
  return data
    ? {
        order: {
          id: data.id,
          checkout_session_id: row.id,
          permalink_url: `${origin}/orders/${data.id}`,
        },
      }
    : {};
}

export async function loadSession(
  id: string,
  agentKeyId: string,
): Promise<SessionRow> {
  if (!/^cs_[A-Za-z0-9]{1,64}$/.test(id)) throw notFound();
  const { data, error } = await db()
    .from("checkout_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`session query failed: ${error.message}`);
  // Sessions belong to the agent key that created them.
  if (!data || data.agent_key_id !== agentKeyId) throw notFound();
  return data;
}

function mergeItems(items: Item[]): Item[] {
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.id, (merged.get(i.id) ?? 0) + i.quantity);
  return [...merged].map(([id, quantity]) => {
    if (quantity > 99)
      throw invalid("invalid", `Quantity for ${id} exceeds 99.`, "$.items");
    return { id, quantity };
  });
}

export async function createSession(
  req: CreateSessionRequest,
  agentKeyId: string,
  idempotencyKey: string | null,
) {
  const { data, error } = await db()
    .from("checkout_sessions")
    .insert({
      id: randomId("cs_"),
      items: mergeItems(req.items) as never,
      buyer: (req.buyer ?? null) as never,
      fulfillment_address: (req.fulfillment_address ?? null) as never,
      fulfillment_option_id: req.fulfillment_address
        ? SHIPPING_OPTION_ID
        : null,
      contract_ref: (req.x_proofcart?.contract ?? null) as never,
      agent_key_id: agentKeyId,
      create_idempotency_key: idempotencyKey
        ? `${agentKeyId}:${idempotencyKey}`
        : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`session insert failed: ${error.message}`);
  return data;
}

function assertOpen(row: SessionRow) {
  if (row.status === "completed")
    throw conflict(
      "session_completed",
      "This checkout session is already completed.",
    );
  if (row.status === "canceled")
    throw conflict("session_canceled", "This checkout session was canceled.");
  if (
    row.completing_at &&
    Date.parse(row.completing_at) > Date.now() - 120_000
  ) {
    throw conflict(
      "session_locked",
      "Payment for this session is in progress.",
    );
  }
}

export async function updateSession(
  row: SessionRow,
  req: UpdateSessionRequest,
) {
  assertOpen(row);
  if (
    req.fulfillment_option_id &&
    req.fulfillment_option_id !== SHIPPING_OPTION_ID
  ) {
    throw invalid(
      "invalid",
      "Unknown fulfillment option.",
      "$.fulfillment_option_id",
    );
  }
  const patch: Partial<SessionRow> = {};
  if (req.items) patch.items = mergeItems(req.items) as never;
  if (req.buyer) patch.buyer = req.buyer as never;
  if (req.fulfillment_address) {
    patch.fulfillment_address = req.fulfillment_address as never;
    patch.fulfillment_option_id = SHIPPING_OPTION_ID;
  }
  if (req.fulfillment_option_id)
    patch.fulfillment_option_id = req.fulfillment_option_id;
  if (req.x_proofcart) patch.contract_ref = req.x_proofcart.contract as never;
  const { data, error } = await db()
    .from("checkout_sessions")
    .update(patch)
    .eq("id", row.id)
    .in("status", ["not_ready_for_payment", "ready_for_payment"])
    .is("completing_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`session update failed: ${error.message}`);
  if (!data)
    throw conflict(
      "session_locked",
      "The session changed while updating; read it again.",
    );
  return data;
}

export async function cancelSession(row: SessionRow, origin: string) {
  assertOpen(row);
  const view = await renderSession(row, origin);
  const snapshot = { ...view.session, status: "canceled" as const };
  const { data, error } = await db()
    .from("checkout_sessions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      snapshot: snapshot as never,
    })
    .eq("id", row.id)
    .in("status", ["not_ready_for_payment", "ready_for_payment"])
    .is("completing_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`session cancel failed: ${error.message}`);
  if (!data)
    throw conflict(
      "session_locked",
      "The session changed while canceling; read it again.",
    );
  return data;
}

/** Keep the stored status and priced snapshot in step with what the agent was just shown. */
export async function persistView(row: SessionRow, view: SessionView) {
  if (row.status === "completed" || row.status === "canceled") return;
  const s = view.session;
  const { error } = await db()
    .from("checkout_sessions")
    .update({
      status: s.status,
      line_items: s.line_items as never,
      totals: s.totals as never,
      messages: s.messages as never,
    })
    .eq("id", row.id)
    .in("status", ["not_ready_for_payment", "ready_for_payment"])
    .is("completing_at", null);
  if (error) throw new Error(`session sync failed: ${error.message}`);
}
