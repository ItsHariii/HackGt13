export const DEPARTMENTS = {
  home_office: "Home office",
  apparel: "Apparel",
  travel: "Travel",
  grocery: "Grocery",
  party: "Party",
} as const;

export const AVAILABILITY_LABEL = {
  in_stock: "In stock",
  limited: "Only a few left",
  out_of_stock: "Out of stock",
} as const;

export function deliveryLabel(min: number, max: number): string {
  return min === max
    ? `Arrives in ${min} day${min === 1 ? "" : "s"}`
    : `Arrives in ${min}–${max} days`;
}

export function returnLabel(terms: {
  returnable: boolean;
  windowDays: number;
  feeMinor: number;
  finalSale: boolean;
}) {
  if (terms.finalSale || !terms.returnable) return "Final sale · no returns";
  return terms.feeMinor > 0
    ? `${terms.windowDays}-day returns · $${(terms.feeMinor / 100).toFixed(2)} fee`
    : `${terms.windowDays}-day free returns`;
}
