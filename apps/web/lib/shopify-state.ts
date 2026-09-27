import "server-only";
import { normalizeProduct } from "@cartel/catalog";
import type { Fact, Offer } from "@cartel/contracts";
import { type ShopifyResult, toDrafts } from "@cartel/evidence";
import type { UcpCheckout } from "@cartel/payments";
import { type CheckoutState, fieldDef } from "@cartel/proof-engine";
import { CheckoutError } from "./checkout-service";
import { ALL_PACKS } from "./evidence";

/*
 * A Shopify store's checkout as the proof engine reads it (TASKS T13.10):
 * prices and totals from the store's own UCP checkout (verified), product
 * facts from the Shopify Catalog (source_stated). UCP core carries no
 * return terms, so every line gets the conservative final-sale envelope;
 * missing facts stay unknown. Drafting and hand-off both build it here, so
 * the approved state and the re-check compare like with like.
 */

export type ShopifyScope = {
  planId: string;
  merchantId: string;
  items: readonly { role: string; sku: string }[];
};

export function shopifyCheckoutState(
  scope: ShopifyScope,
  checkout: UcpCheckout,
  catalogRead: ShopifyResult,
  now: string,
  sourceId: string,
): CheckoutState {
  const products = catalogRead.products.map((p) =>
    normalizeProduct(p, ALL_PACKS),
  );
  const offers: Offer[] = [];
  const facts: Fact[] = [];
  const lines: CheckoutState["basket"]["lines"] = [];
  for (const [i, line] of checkout.line_items.entries()) {
    const signed =
      scope.items.find((item) => item.sku === line.item.id) ?? scope.items[i];
    const product = products.find((p) =>
      p.offers.some((o) => o.externalId === line.item.id),
    );
    const catalogOffer = product?.offers.find(
      (o) => o.externalId === line.item.id,
    );
    const subtotal = line.totals.find((t) => t.type === "subtotal")?.amount;
    const price =
      line.item.price ??
      (subtotal !== undefined && subtotal % line.quantity === 0
        ? subtotal / line.quantity
        : undefined);
    if (!signed || !product || !catalogOffer || price === undefined)
      throw new CheckoutError("handoff_evidence_missing");
    const id = line.item.id;
    const productId = product.externalId;
    const sellerId = catalogOffer.sellerId ?? catalogOffer.merchantId;
    offers.push({
      id,
      productId,
      merchant: scope.merchantId,
      sellerId,
      sku: id,
      title: product.title,
      ...(product.gtin ? { gtin: product.gtin } : {}),
      price: { amountMinor: price, currency: checkout.currency },
      availability: "unknown",
      tier: "handoff",
      // UCP core does not assert return terms. Conservative envelope; missing facts remain unknown.
      terms: { finalSale: true, returnWindowDays: 0, returnFeeMinor: 0 },
    });
    lines.push({ role: signed.role, offerId: id, qty: line.quantity });
    facts.push(
      ...toDrafts(
        product.facts.filter((c) => !c.offerKey || c.offerKey === id),
        (c) => ({
          kind: c.offerKey ? "offer" : "product",
          id: c.offerKey ? id : productId,
        }),
        catalogRead.source,
        (field) => fieldDef(field, ALL_PACKS),
      ).map((f, n) => ({ ...f, id: `${id}:${n}`, conflict: false })),
    );
    facts.push({
      id: `price:${id}`,
      subjectKind: "offer",
      subjectId: id,
      field: "offer.price",
      value: { amountMinor: price, currency: checkout.currency },
      state: "verified",
      conflict: false,
      sourceId,
      extractor: "ucp_checkout",
      retrievedAt: now,
    });
  }
  const amount = (type: string) => {
    const totals = checkout.totals.filter((t) => t.type === type);
    if (totals.length !== 1) throw new CheckoutError("handoff_totals_missing");
    return { amountMinor: totals[0]?.amount ?? 0, currency: checkout.currency };
  };
  const live: CheckoutState = {
    basket: { id: scope.planId, lines },
    offers,
    facts,
    sources: {
      [sourceId]: { authority: "merchant_checkout" },
      [catalogRead.source.id]: { authority: "catalog" },
    },
    quotes: [
      {
        merchant: scope.merchantId,
        shipping: amount("fulfillment"),
        tax: amount("tax"),
        total: amount("total"),
        state: "verified",
        factId: sourceId,
        retrievedAt: now,
      },
    ],
  };
  return live;
}

/**
 * True when the Shopify Catalog lists every item under this store's origin,
 * so a hand-off never goes to a store the catalog didn't name.
 */
export function catalogListsStore(
  catalogRead: ShopifyResult,
  items: readonly { sku: string }[],
  origin: string,
): boolean {
  const want = new URL(origin).origin;
  return items.every((item) =>
    catalogRead.products.some((p) =>
      p.offers.some((o) => {
        if (o.externalId !== item.sku) return false;
        const url = o.url ?? p.url;
        try {
          return !!url && new URL(url).origin === want;
        } catch {
          return false;
        }
      }),
    ),
  );
}
