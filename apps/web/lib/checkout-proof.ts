import { type Fact, Offer } from "@cartel/contracts";
import type { CheckoutRead, SpecRefresh } from "@cartel/evidence";
import { toDrafts } from "@cartel/evidence";
import { type CheckoutState, fieldDef, type Pack } from "@cartel/proof-engine";

/**
 * What a checkout read is proved for: a signed contract, or a plan's basket
 * before anything is signed. Items give each line its role.
 */
export type CheckoutScope = {
  planId: string;
  merchants: readonly { id: string }[];
  items: readonly { role: string; sku: string; variant?: string | undefined }[];
};

/** Fresh merchant facts only. Never carry stale product claims into checkout. */
export function checkoutState(
  contract: CheckoutScope,
  read: CheckoutRead,
  specs: readonly SpecRefresh[],
  packs: readonly Pack[],
): CheckoutState {
  const merchant = contract.merchants[0];
  if (
    !merchant ||
    contract.merchants.length !== 1 ||
    read.lines.length !== read.session.line_items.length ||
    specs.length !== read.lines.length
  )
    throw new Error("checkout_scope_invalid");
  const offers: Offer[] = [];
  const facts: Fact[] = [];
  const lines: CheckoutState["basket"]["lines"] = [];
  const sources: NonNullable<CheckoutState["sources"]> extends Readonly<infer R>
    ? R
    : never = {};
  read.lines.forEach((line, i) => {
    const raw = read.session.line_items[i];
    const x = raw?.item.x_cartel;
    const spec = specs[i];
    const approved =
      contract.items.find((item) => item.sku === line.itemId) ??
      contract.items[i];
    if (
      !raw ||
      !approved ||
      !x ||
      !spec?.found ||
      line.offer.priceMinor === null
    )
      throw new Error("checkout_evidence_missing");
    const id = `checkout:${raw.id}`;
    const productId = `product:${x.ships_gtin}`;
    offers.push(
      Offer.parse({
        id,
        productId,
        merchant: merchant.id,
        sellerId: x.seller_id,
        sku: line.itemId,
        gtin: x.ships_gtin,
        title: x.title,
        ...(approved.variant ? { variant: approved.variant } : {}),
        price: {
          amountMinor: line.offer.priceMinor,
          currency: read.session.currency,
        },
        availability: x.availability,
        ...(line.offer.deliveryLatest
          ? { deliveryBy: line.offer.deliveryLatest }
          : {}),
        terms: {
          finalSale:
            x.final_sale ||
            x.return_policy.finalSale ||
            !x.return_policy.returnable,
          returnWindowDays: x.return_policy.windowDays,
          returnFeeMinor: x.return_policy.feeMinor,
        },
        ...(x.subscription ? { recurring: x.subscription.every } : {}),
        tier: "full",
        url: x.spec_url,
      }),
    );
    lines.push({ role: approved.role, offerId: id, qty: raw.item.quantity });
    for (const [claims, subject, source] of [
      [line.claims, { kind: "offer" as const, id }, read.source],
      [spec.claims, { kind: "product" as const, id: productId }, spec.source],
    ] as const) {
      const drafts = toDrafts(claims, subject, source, (field) =>
        fieldDef(field, packs),
      );
      facts.push(
        ...drafts.map((f, n) => ({
          ...f,
          id: `${source.id}:${id}:${n}`,
          conflict: false,
        })),
      );
      sources[source.id] = {
        authority:
          source.sourceType === "acp_checkout"
            ? "merchant_checkout"
            : "merchant",
      };
    }
  });
  const total = (type: string) => {
    const matches = read.session.totals.filter((t) => t.type === type);
    if (
      matches.length !== 1 ||
      !Number.isSafeInteger(matches[0]?.amount) ||
      (matches[0]?.amount ?? -1) < 0
    )
      throw new Error("checkout_totals_missing");
    return {
      amountMinor: matches[0]?.amount as number,
      currency: read.session.currency,
    };
  };
  const expected =
    offers.reduce(
      (sum, offer, i) => sum + offer.price.amountMinor * (lines[i]?.qty ?? 0),
      0,
    ) +
    total("fulfillment").amountMinor +
    total("tax").amountMinor;
  if (
    !Number.isSafeInteger(expected) ||
    total("total").amountMinor !== expected
  )
    throw new Error("checkout_totals_mismatch");
  return {
    basket: { id: contract.planId, lines },
    offers,
    facts,
    sources,
    quotes: [
      {
        merchant: merchant.id,
        shipping: total("fulfillment"),
        tax: total("tax"),
        total: total("total"),
        state: "verified",
        factId: read.source.id,
        retrievedAt: read.source.fetchedAt,
      },
    ],
    // Cartel never requests substitutions on this ACP integration.
    order: { "order.substitutions_allowed": false },
  };
}
