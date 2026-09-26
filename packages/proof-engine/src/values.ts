import type { Box, Money, Quantity, Range, Value } from "@proofcart/contracts";
import type { FieldDef } from "./fields";
import { compareQuantity, sortedBox, toBase } from "./units";

/* Type guards and comparisons over the contracts `Value` union. */

type Obj = Exclude<Value, string | number | boolean | string[]>;

function isObj(v: Value | null | undefined): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isQuantity(v: Value | null | undefined): v is Quantity {
  return isObj(v) && "unit" in v && "value" in v;
}

export function isMoney(v: Value | null | undefined): v is Money {
  return isObj(v) && "amountMinor" in v;
}

export function isRange(v: Value | null | undefined): v is Range {
  return isObj(v) && "min" in v && "max" in v;
}

export function isBox(v: Value | null | undefined): v is Box {
  return isObj(v) && "dims" in v;
}

export function isStringList(v: Value | null | undefined): v is string[] {
  return Array.isArray(v);
}

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export function isIsoDate(v: Value | null | undefined): v is string {
  return (
    typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))
  );
}

/** Enum-aware text normalization: trims, lowercases and applies the field's aliases. */
export function normalizeText(s: string, def?: FieldDef): string {
  const t = s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return def?.aliases?.[t] ?? t;
}

type Scalar = Quantity | Money | number | string;

/**
 * Orders two scalar values of the same kind: quantities (within the field's
 * tolerance), money (same currency), plain numbers and ISO dates. Returns
 * null when they are not comparable.
 */
export function compareScalar(
  a: Scalar,
  b: Scalar,
  def?: FieldDef,
): -1 | 0 | 1 | null {
  if (isQuantity(a) && isQuantity(b))
    return compareQuantity(a, b, def?.tolerance);
  if (isMoney(a) && isMoney(b)) {
    if (a.currency !== b.currency) return null;
    return a.amountMinor < b.amountMinor
      ? -1
      : a.amountMinor > b.amountMinor
        ? 1
        : 0;
  }
  if (typeof a === "number" && typeof b === "number")
    return a < b ? -1 : a > b ? 1 : 0;
  if (isIsoDate(a) && isIsoDate(b)) {
    const x = dayOrInstant(a);
    const y = dayOrInstant(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return null;
}

/**
 * A date-only value compares as that whole day, so "2026-09-28" equals any
 * instant on the 28th (UTC) for eq/lte/gte, while `before` stays strict.
 */
function dayOrInstant(s: string): number {
  return s.length === 10
    ? Date.parse(`${s}T00:00:00Z`)
    : startOfUtcDay(Date.parse(s));
}

function startOfUtcDay(ms: number): number {
  return ms - (((ms % 86_400_000) + 86_400_000) % 86_400_000);
}

export function isScalar(v: Value | null | undefined): v is Scalar {
  return isQuantity(v) || isMoney(v) || typeof v === "number" || isIsoDate(v);
}

/** Equality that respects units, tolerance, enum aliases and set semantics for lists. */
export function sameValue(a: Value, b: Value, def?: FieldDef): boolean {
  if (isBox(a) && isBox(b)) {
    const x = sortedBox(a);
    const y = sortedBox(b);
    if (!x || !y) return false;
    const tol = def?.tolerance ? (toBase(def.tolerance) ?? 0n) : 0n;
    return x.every((v, i) => {
      const d = v - (y[i] as bigint);
      return d <= tol && d >= -tol;
    });
  }
  if (isRange(a) && isRange(b)) {
    return (
      sameValue(a.min as Value, b.min as Value, def) &&
      sameValue(a.max as Value, b.max as Value, def)
    );
  }
  if (isStringList(a) && isStringList(b)) {
    const x = new Set(a.map((s) => normalizeText(s, def)));
    const y = new Set(b.map((s) => normalizeText(s, def)));
    return x.size === y.size && [...x].every((s) => y.has(s));
  }
  if (isScalar(a) && isScalar(b)) return compareScalar(a, b, def) === 0;
  if (typeof a === "string" && typeof b === "string") {
    return normalizeText(a, def) === normalizeText(b, def);
  }
  return a === b;
}

/** Calendar arithmetic on the UTC date of an ISO date or timestamp; returns `YYYY-MM-DD`. */
export function addDays(iso: string, days: number): string {
  const start = dayOrInstant(iso);
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}
