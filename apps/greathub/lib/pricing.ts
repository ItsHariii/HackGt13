// Checkout arithmetic, in integer cents. Matches greathub.quote(): one flat
// shipping charge per order plus per-offer surcharges, and tax on merchandise
// rounded half-up to the cent, then allocated to lines by largest remainder so
// the line taxes always add up to the order tax.

export interface PricingLine {
  unitPriceMinor: number;
  quantity: number;
  shippingFeeMinor: number;
}

export interface PricingPolicy {
  shippingFlatMinor: number;
  taxRateBps: number;
}

export interface PricedLine {
  baseMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface PricedCart {
  lines: PricedLine[];
  itemsBaseMinor: number;
  subtotalMinor: number;
  fulfillmentMinor: number;
  taxMinor: number;
  feeMinor: number;
  totalMinor: number;
}

/** Half-up rounding of `amount × bps / 10000` for non-negative integers. */
export function taxOf(amountMinor: number, rateBps: number): number {
  return Math.floor((amountMinor * rateBps + 5000) / 10000);
}

export function priceCart(
  lines: readonly PricingLine[],
  policy: PricingPolicy,
): PricedCart {
  for (const l of lines) {
    if (
      ![l.unitPriceMinor, l.quantity, l.shippingFeeMinor].every(
        Number.isSafeInteger,
      ) ||
      l.quantity < 1
    ) {
      throw new RangeError(
        "pricing needs integer cents and a positive quantity",
      );
    }
  }
  const bases = lines.map((l) => l.unitPriceMinor * l.quantity);
  const itemsBaseMinor = bases.reduce((a, b) => a + b, 0);
  const taxMinor = taxOf(itemsBaseMinor, policy.taxRateBps);

  // Largest-remainder allocation of the order tax across lines.
  const exact = bases.map((b) =>
    itemsBaseMinor === 0 ? 0 : (taxMinor * b) / itemsBaseMinor,
  );
  const lineTax = exact.map(Math.floor);
  let left = taxMinor - lineTax.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    lineTax[i] = (lineTax[i] ?? 0) + 1;
    left--;
  }

  const fulfillmentMinor =
    lines.length === 0
      ? 0
      : policy.shippingFlatMinor +
        lines.reduce((a, l) => a + l.shippingFeeMinor, 0);
  return {
    lines: bases.map((base, i) => ({
      baseMinor: base,
      discountMinor: 0,
      subtotalMinor: base,
      taxMinor: lineTax[i] ?? 0,
      totalMinor: base + (lineTax[i] ?? 0),
    })),
    itemsBaseMinor,
    subtotalMinor: itemsBaseMinor,
    fulfillmentMinor,
    taxMinor,
    feeMinor: 0,
    totalMinor: itemsBaseMinor + fulfillmentMinor + taxMinor,
  };
}
