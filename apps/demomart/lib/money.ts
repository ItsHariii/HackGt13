const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMinor(amountMinor: number): string {
  return usd.format(amountMinor / 100);
}

/** Exact decimal string for JSON-LD (`"329.00"`), never a float. */
export function decimalMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
