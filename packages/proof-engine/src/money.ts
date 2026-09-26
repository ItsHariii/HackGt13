import type { Money } from "@cartel/contracts";
import { dec, mul, roundHalfEven, roundHalfUp } from "./decimal";

/*
 * Money is integer minor units plus an ISO 4217 code (SDD §8.2). Every
 * operation checks the currency and stays inside the safe-integer range, so
 * a total is either exact or an error, never a rounded float.
 */

export class MoneyError extends Error {
  override name = "MoneyError";
}

function checkSafe(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyError(`amount out of safe integer range: ${amountMinor}`);
  }
  return amountMinor;
}

export function money(amountMinor: number, currency: string): Money {
  return { amountMinor: checkSafe(amountMinor), currency };
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Unit price × quantity. */
export function timesQty(unit: Money, qty: number): Money {
  if (!Number.isSafeInteger(qty) || qty < 0) {
    throw new MoneyError(`bad quantity: ${qty}`);
  }
  return money(unit.amountMinor * qty, unit.currency);
}

/** Sum in one currency; an empty list sums to zero in `currency`. */
export function sumMoney(items: readonly Money[], currency: string): Money {
  let total = money(0, currency);
  for (const m of items) total = addMoney(total, m);
  return total;
}

/** -1, 0 or 1. Throws on a currency mismatch rather than comparing apples to euros. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amountMinor < b.amountMinor
    ? -1
    : a.amountMinor > b.amountMinor
      ? 1
      : 0;
}

export type Rounding = "half_even" | "half_up";

/**
 * Applies a rate given as decimal text (`"0.07"` for 7%, `"0.08875"` for
 * 8.875%) and rounds to a whole minor unit.
 *
 * The default is **banker's rounding** (round half to even): an exact half
 * cent goes to the even neighbour, so $0.125 → $0.12 and $0.135 → $0.14.
 * Over many lines this is unbiased, where half-up drifts upward. A merchant
 * that rounds half-up can be matched with `rounding: "half_up"`; the
 * merchant's own quote is still compared against the engine's figure.
 */
export function applyRate(
  amount: Money,
  rate: string,
  rounding: Rounding = "half_even",
): Money {
  const r = dec(rate);
  const a = dec(amount.amountMinor);
  if (r === null || a === null || r < 0n) {
    throw new MoneyError(`bad rate: ${rate}`);
  }
  const exact = mul(a, r);
  const rounded =
    rounding === "half_even" ? roundHalfEven(exact) : roundHalfUp(exact);
  return money(Number(rounded), amount.currency);
}

const MONEY_TEXT =
  /^\s*(?:([A-Z]{3})\s*)?([$€£])?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:([A-Z]{3}))?\s*$/;
const SYMBOL_CURRENCY: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};

/**
 * Reads `$1,000`, `329.00`, `USD 12.5`, `19.99 EUR` into minor units for a
 * two-decimal currency. Returns null for anything ambiguous, such as a
 * symbol that disagrees with the code or no currency at all without
 * `fallbackCurrency`.
 */
export function parseMoney(
  text: string,
  fallbackCurrency?: string,
): Money | null {
  if (typeof text !== "string") return null;
  const m = MONEY_TEXT.exec(text);
  if (!m?.[3]) return null;
  const [, pre, symbol, int, frac = "", post] = m;
  const codes = [
    pre,
    post,
    symbol ? SYMBOL_CURRENCY[symbol] : undefined,
  ].filter((c): c is string => c !== undefined);
  if (new Set(codes).size > 1) return null;
  const currency = codes[0] ?? fallbackCurrency;
  if (!currency) return null;
  const minor = Number(
    `${(int as string).replace(/,/g, "")}${frac.padEnd(2, "0")}`,
  );
  return Number.isSafeInteger(minor) ? money(minor, currency) : null;
}
