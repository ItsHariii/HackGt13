import type { Fact, Offer, ReturnTerms } from "@proofcart/contracts";
import {
  applyRate,
  type CheckoutState,
  type MerchantQuote,
  money,
  offerFacts,
  type SourceInfo,
  sumMoney,
  timesQty,
} from "@proofcart/proof-engine";

/*
 * Builds DemoMart checkout states for tests and ProofBench: offers, their
 * checkout facts, product facts, a merchant quote (shipping + tax computed
 * the way DemoMart's checkout does) and the source authority map.
 */

export const DEMOMART = "demomart";
export const DEMOMART_ORIGIN = "https://demomart.example";
export const DEMOMART_CHECKOUT_SOURCE = "src_demomart_checkout";

export const TERMS_30: ReturnTerms = {
  finalSale: false,
  returnWindowDays: 30,
  returnFeeMinor: 0,
};

export type OfferInit = {
  id: string;
  productId: string;
  sku: string;
  title: string;
  priceMinor: number;
  gtin?: string;
  deliveryBy?: string;
  terms?: ReturnTerms;
  sellerId?: string;
  variant?: string;
  recurring?: string;
  availability?: Offer["availability"];
};

export function demomartOffer(o: OfferInit): Offer {
  return {
    id: o.id,
    productId: o.productId,
    merchant: DEMOMART,
    sellerId: o.sellerId ?? "dm_seller_1",
    sku: o.sku,
    ...(o.gtin ? { gtin: o.gtin } : {}),
    ...(o.variant ? { variant: o.variant } : {}),
    title: o.title,
    price: money(o.priceMinor, "USD"),
    availability: o.availability ?? "in_stock",
    ...(o.deliveryBy ? { deliveryBy: o.deliveryBy } : {}),
    terms: o.terms ?? TERMS_30,
    ...(o.recurring ? { recurring: o.recurring } : {}),
    tier: "full",
    url: `${DEMOMART_ORIGIN}/p/${o.sku.toLowerCase()}`,
  };
}

export type Line = {
  role: string;
  offer: Offer;
  facts: readonly Fact[];
  qty?: number;
};

export type CheckoutOptions = {
  now: string;
  shippingMinor?: number;
  /** Decimal tax rate DemoMart applies to merchandise. */
  taxRate?: string;
  /** Overrides the total DemoMart reports, to model a mismatch. */
  quotedTotalMinor?: number;
  order?: Record<string, boolean>;
};

/** A DemoMart checkout for these lines, as ProofCart would read it at `now`. */
export function demomartCheckout(
  lines: readonly Line[],
  opts: CheckoutOptions,
): CheckoutState {
  const offers = lines.map((l) => l.offer);
  const merchandise = sumMoney(
    lines.map((l) => timesQty(l.offer.price, l.qty ?? 1)),
    "USD",
  );
  const shipping = money(opts.shippingMinor ?? 2_400, "USD");
  const tax = applyRate(merchandise, opts.taxRate ?? "0.07");
  const total = sumMoney([merchandise, shipping, tax], "USD");
  const quote: MerchantQuote = {
    merchant: DEMOMART,
    shipping,
    tax,
    total:
      opts.quotedTotalMinor === undefined
        ? total
        : money(opts.quotedTotalMinor, "USD"),
    state: "verified",
    factId: `dm_checkout@${opts.now}`,
    retrievedAt: opts.now,
  };
  const productFacts = lines.flatMap((l) => l.facts);
  const sources: Record<string, SourceInfo> = {
    [DEMOMART_CHECKOUT_SOURCE]: {
      authority: "merchant_checkout",
      name: "DemoMart checkout",
    },
  };
  for (const f of productFacts) {
    sources[f.sourceId] ??= { authority: "merchant", name: "DemoMart" };
  }
  return {
    basket: {
      id: "b_fixture",
      lines: lines.map((l) => ({
        role: l.role,
        offerId: l.offer.id,
        qty: l.qty ?? 1,
      })),
    },
    offers,
    facts: [
      ...productFacts,
      ...offers.flatMap((o) =>
        offerFacts(o, {
          sourceId: DEMOMART_CHECKOUT_SOURCE,
          retrievedAt: opts.now,
        }),
      ),
    ],
    sources,
    quotes: [quote],
    order: opts.order ?? { "order.substitutions_allowed": false },
  };
}

/** A spec fact from DemoMart's JSON-LD, the way the evidence adapter records it. */
export function specFact(
  id: string,
  productId: string,
  field: string,
  value: Fact["value"],
  extra: Partial<Fact> = {},
): Fact {
  return {
    id,
    subjectKind: "product",
    subjectId: productId,
    field,
    value,
    state: "source_stated",
    conflict: false,
    sourceId: `src_${productId}_jsonld`,
    extractor: "jsonld",
    retrievedAt: "2026-09-26T14:02:05Z",
    ...extra,
  };
}
