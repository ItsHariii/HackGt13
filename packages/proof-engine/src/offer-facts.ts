import type { EvidenceState, Fact, Offer } from "@cartel/contracts";

export type OfferFactMeta = {
  sourceId: string;
  retrievedAt: string;
  /** Defaults to `verified`: the merchant's checkout is the authority for its own offer. */
  state?: EvidenceState;
  freshUntil?: string;
};

/**
 * The offer-level facts the engine reads (price, delivery, terms,
 * availability, seller), taken from a checkout's structured offer. IDs are
 * derived from the offer ID so the same checkout always yields the same facts.
 */
export function offerFacts(offer: Offer, meta: OfferFactMeta): Fact[] {
  const state = meta.state ?? "verified";
  const base = {
    subjectKind: "offer" as const,
    subjectId: offer.id,
    state,
    conflict: false,
    sourceId: meta.sourceId,
    extractor: "checkout",
    retrievedAt: meta.retrievedAt,
    ...(meta.freshUntil ? { freshUntil: meta.freshUntil } : {}),
  };
  const facts: Fact[] = [
    {
      ...base,
      id: `${offer.id}:price`,
      field: "offer.price",
      value: offer.price,
    },
    {
      ...base,
      id: `${offer.id}:final_sale`,
      field: "offer.final_sale",
      value: offer.terms.finalSale,
    },
    {
      ...base,
      id: `${offer.id}:return_window`,
      field: "offer.return_window_days",
      value: { value: offer.terms.returnWindowDays, unit: "day" },
    },
    {
      ...base,
      id: `${offer.id}:return_fee`,
      field: "offer.return_fee",
      value: {
        amountMinor: offer.terms.returnFeeMinor,
        currency: offer.price.currency,
      },
    },
    {
      ...base,
      id: `${offer.id}:availability`,
      field: "offer.availability",
      value: offer.availability,
    },
    {
      ...base,
      id: `${offer.id}:seller`,
      field: "offer.seller",
      value: offer.sellerId,
    },
  ];
  if (offer.deliveryBy) {
    facts.push({
      ...base,
      id: `${offer.id}:delivery_by`,
      field: "offer.delivery_by",
      // The field caps this at `estimated`: a delivery date is a forecast.
      value: offer.deliveryBy,
    });
  }
  return facts;
}
