import type { CheckoutSession, LineItem } from "@cartel/acp";
import { CORE_FIELDS } from "@cartel/proof-engine";
import { claim, freshUntilFor } from "./claims";
import { type Availability, type ClaimedFact, SOURCE_AUTHORITY } from "./types";

/*
 * Offer facts from a merchant's ACP checkout (SDD §11.1, §13.2). The checkout
 * is the authority for its own price, availability, terms and delivery, so
 * these are `verified` (delivery is still only an `estimate`). Line items
 * without GreatHub's `x_cartel` extension carry no terms and yield price only.
 */

export type CheckoutOfferUpdate = {
  /** The ACP item ID (the merchant's SKU / offer key). */
  itemId: string;
  priceMinor: number | null;
  currency: string;
  availability: Availability;
  finalSale: boolean | null;
  returnPolicy: {
    returnable: boolean;
    windowDays: number;
    feeMinor: number;
    finalSale: boolean;
  } | null;
  deliveryEarliest: string | null;
  deliveryLatest: string | null;
  sellerId: string | null;
  retrievedAt: string;
  freshUntil: string;
};

export type CheckoutLine = {
  itemId: string;
  offer: CheckoutOfferUpdate;
  claims: ClaimedFact[];
};

const OFFER_FRESHNESS = CORE_FIELDS["offer.price"];

function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Unit price, only when the line's base amount divides evenly by its quantity. */
function unitPrice(line: LineItem): number | null {
  const qty = line.item.quantity;
  return qty > 0 && line.base_amount % qty === 0
    ? line.base_amount / qty
    : null;
}

/** Offer updates and claims for every line of a checkout session read at `retrievedAt`. */
export function checkoutLines(
  session: CheckoutSession,
  retrievedAt: string,
): CheckoutLine[] {
  const auth = SOURCE_AUTHORITY.acp_checkout;
  const selected =
    session.fulfillment_options.find(
      (o) => o.id === session.fulfillment_option_id,
    ) ?? session.fulfillment_options[0];
  const freshUntil = freshUntilFor(OFFER_FRESHNESS, retrievedAt) ?? retrievedAt;
  return session.line_items.map((line) => {
    const x = line.item.x_cartel;
    const price = unitPrice(line);
    const c = (
      field: string,
      value: Parameters<typeof claim>[1],
      raw?: string,
    ) => claim(field, value, raw, auth, CORE_FIELDS[field], "checkout");
    const claims: ClaimedFact[] = [
      c(
        "offer.price",
        price === null
          ? null
          : { amountMinor: price, currency: session.currency.toUpperCase() },
      ),
    ];
    let deliveryEarliest = isoDate(selected?.earliest_delivery_time);
    let deliveryLatest = isoDate(selected?.latest_delivery_time);
    if (x) {
      deliveryEarliest ??= addDays(retrievedAt, x.delivery.min_days);
      deliveryLatest ??= addDays(retrievedAt, x.delivery.max_days);
      claims.push(
        c("offer.final_sale", x.final_sale),
        c("offer.returnable", x.return_policy.returnable),
        c("offer.return_window_days", {
          value: x.return_policy.windowDays,
          unit: "day",
        }),
        c("offer.return_fee", {
          amountMinor: x.return_policy.feeMinor,
          currency: session.currency.toUpperCase(),
        }),
        c("offer.availability", x.availability),
        c("offer.seller", x.seller_id),
      );
    }
    if (deliveryLatest) claims.push(c("offer.delivery_by", deliveryLatest));
    const offer: CheckoutOfferUpdate = {
      itemId: line.item.id,
      priceMinor: price,
      currency: session.currency.toUpperCase(),
      availability: x?.availability ?? "unknown",
      finalSale: x?.final_sale ?? null,
      returnPolicy: x
        ? {
            returnable: x.return_policy.returnable,
            windowDays: x.return_policy.windowDays,
            feeMinor: x.return_policy.feeMinor,
            finalSale: x.return_policy.finalSale,
          }
        : null,
      deliveryEarliest,
      deliveryLatest,
      sellerId: x?.seller_id ?? null,
      retrievedAt,
      freshUntil,
    };
    return { itemId: line.item.id, offer, claims };
  });
}
