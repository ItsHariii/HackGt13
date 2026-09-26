import {
  type Box,
  type Dimension,
  type Quantity,
  UNIT_DIMENSION,
  type Unit,
} from "@cartel/contracts";
import { type Decimal, dec, decOf, div, mul, sub, toNumber } from "./decimal";

/** The unit every quantity of a dimension is compared in (SDD §8.2). */
export const BASE_UNIT: Record<Dimension, Unit> = {
  length: "mm",
  mass: "g",
  power: "W",
  energy: "Wh",
  charge: "mAh",
  volume: "ml",
  voltage: "V",
  ratio: "pct",
  duration: "day",
  count: "count",
};

/** Exact factor from each unit to its dimension's base unit. */
const TO_BASE: Record<Unit, Decimal> = {
  mm: decOf("1"),
  cm: decOf("10"),
  m: decOf("1000"),
  in: decOf("25.4"),
  ft: decOf("304.8"),
  g: decOf("1"),
  kg: decOf("1000"),
  oz: decOf("28.349523125"),
  lb: decOf("453.59237"),
  W: decOf("1"),
  Wh: decOf("1"),
  mAh: decOf("1"),
  ml: decOf("1"),
  l: decOf("1000"),
  fl_oz: decOf("29.5735295625"),
  V: decOf("1"),
  pct: decOf("1"),
  day: decOf("1"),
  count: decOf("1"),
};

export function dimensionOf(unit: Unit): Dimension {
  return UNIT_DIMENSION[unit];
}

/** The value in its dimension's base unit, or null if it isn't finite. */
export function toBase(q: Pick<Quantity, "value" | "unit">): Decimal | null {
  const v = dec(q.value);
  return v === null ? null : mul(v, TO_BASE[q.unit]);
}

/** Converts between units of one dimension; null across dimensions. */
export function convert(q: Quantity, unit: Unit): Quantity | null {
  if (dimensionOf(q.unit) !== dimensionOf(unit)) return null;
  const base = toBase(q);
  if (base === null) return null;
  const value = toNumber(div(base, TO_BASE[unit]));
  return q.qualifier
    ? { value, unit, qualifier: q.qualifier }
    : { value, unit };
}

/**
 * Compares two quantities of the same dimension within a tolerance given in
 * any unit of that dimension. Returns null when the dimensions differ, which
 * callers report as `incomparable` rather than as a failure.
 */
export function compareQuantity(
  a: Pick<Quantity, "value" | "unit">,
  b: Pick<Quantity, "value" | "unit">,
  tolerance?: Pick<Quantity, "value" | "unit">,
): -1 | 0 | 1 | null {
  const dim = dimensionOf(a.unit);
  if (dim !== dimensionOf(b.unit)) return null;
  const av = toBase(a);
  const bv = toBase(b);
  if (av === null || bv === null) return null;
  let tol = 0n as Decimal;
  if (tolerance) {
    if (dimensionOf(tolerance.unit) !== dim) return null;
    tol = toBase(tolerance) ?? tol;
  }
  const delta = sub(av, bv);
  if (delta > tol) return 1;
  if (delta < -tol) return -1;
  return 0;
}

/** A box's dimensions in base units, smallest first. */
export function sortedBox(box: Box): Decimal[] | null {
  const out: Decimal[] = [];
  for (const d of box.dims) {
    const v = toBase({ value: d, unit: box.unit });
    if (v === null) return null;
    out.push(v);
  }
  return out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

/**
 * Whether `item` fits inside `limit` in some orientation. Sorting both
 * triples and comparing axis by axis is exact for axis-aligned boxes: if the
 * sorted item fits the sorted limit, that orientation works, and if it does
 * not, no rotation can (a smaller axis cannot take a larger slot).
 */
export function boxFits(
  item: Box,
  limit: Box,
  tolerance?: Pick<Quantity, "value" | "unit">,
): { fits: boolean; overBy: number[] } | null {
  const a = sortedBox(item);
  const b = sortedBox(limit);
  if (!a || !b) return null;
  const tol = tolerance ? (toBase(tolerance) ?? (0n as Decimal)) : 0n;
  const overBy = a.map((v, i) => {
    const over = sub(v, b[i] as Decimal);
    return over > tol ? toNumber(div(over, TO_BASE[limit.unit])) : 0;
  });
  return { fits: overBy.every((o) => o === 0), overBy };
}
