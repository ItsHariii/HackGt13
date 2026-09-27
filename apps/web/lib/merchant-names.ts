/** Short display names for merchants in source labels ("GreatHub listing says"). */
const MERCHANT_NAME: Record<string, string> = { greathub: "GreatHub" };

export function merchantName(id: string | undefined): string {
  return id ? (MERCHANT_NAME[id] ?? id) : "Merchant";
}

/** The name a checkout read or listing is shown under, by who stated it. */
export function sourceNameFor(authority: string, merchant: string): string {
  if (authority === "merchant_checkout") return `${merchant} checkout`;
  if (authority === "merchant") return `${merchant} listing`;
  if (authority === "manufacturer") return "Manufacturer";
  return "Source";
}
