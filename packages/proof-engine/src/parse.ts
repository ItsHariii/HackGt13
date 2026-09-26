import type {
  Box,
  Dimension,
  Qualifier,
  Quantity,
  Range,
  Unit,
} from "@cartel/contracts";
import { dec, decOf, mul, toNumber, toText } from "./decimal";
import { compareQuantity, dimensionOf } from "./units";

/*
 * Deterministic grammar for spec text (SDD §8.2). It never calls a model and
 * never throws: text it can't read with certainty returns null, which the
 * engine treats as "no fact" rather than guessing.
 *
 *   measure   := qualifier? amount unit suffix?
 *              | qualifier? amount unit? ("-" | "to") amount unit   (range)
 *              | "between" amount unit? "and" amount unit           (range)
 *              | feet "'" inches '"'?                                (5'10")
 *              | amount unit? ("x" amount unit?){2}                  (box)
 *   amount    := digits ("," ddd)* ("." digits)?     ("20k mAh" is read as 20000)
 */

export type ParseHint = {
  /**
   * The dimension the field expects. Resolves `oz` (mass unless the field is
   * a volume, where it means US fluid ounces) and rejects other dimensions.
   */
  dimension?: Dimension;
  /** Unit for a bare number, e.g. a JSON-LD `width` of `"46.5"`. */
  defaultUnit?: Unit;
};

const UNIT_WORDS: [RegExp, Unit][] = [
  [/^(?:mm|millimet(?:er|re)s?)$/, "mm"],
  [/^(?:cm|centimet(?:er|re)s?)$/, "cm"],
  [/^(?:m|met(?:er|re)s?)$/, "m"],
  [/^(?:in|in\.|inch|inches|"|'')$/, "in"],
  [/^(?:ft|ft\.|foot|feet|')$/, "ft"],
  [/^(?:g|gr|grams?)$/, "g"],
  [/^(?:kg|kgs|kilograms?)$/, "kg"],
  [/^(?:oz|oz\.|ounces?)$/, "oz"],
  [/^(?:lb|lbs|lb\.|lbs\.|pounds?)$/, "lb"],
  [/^(?:w|watts?)$/, "W"],
  [/^(?:wh|watt[- ]?hours?)$/, "Wh"],
  [/^(?:mah|milliamp[- ]?hours?|milliampere[- ]?hours?)$/, "mAh"],
  [/^(?:ml|millilit(?:er|re)s?)$/, "ml"],
  [/^(?:l|lit(?:er|re)s?)$/, "l"],
  [/^(?:fl\.? ?oz\.?|fluid ounces?)$/, "fl_oz"],
  [/^(?:v|volts?)$/, "V"],
  [/^(?:%|percent|pct)$/, "pct"],
  [/^(?:days?)$/, "day"],
];

const PREFIX_QUALIFIERS: [RegExp, Qualifier][] = [
  [/^(?:up to|upto)\s*/, "up_to"],
  [/^(?:max\.?|maximum|at most|<=|≤|<)\s*/, "max"],
  [/^(?:min\.?|minimum|at least|>=|≥|>)\s*/, "min"],
  [/^(?:approx\.?|approximately|about|around|circa|ca\.|~|≈)\s*/, "approx"],
];

const SUFFIX_QUALIFIERS: [RegExp, Qualifier][] = [
  [/\s*(?:\(max\.?\)|max\.?|maximum|or less)$/, "max"],
  [/\s*(?:\(min\.?\)|min\.?|minimum|or more|\+)$/, "min"],
  [/\s*(?:\(approx\.?\)|approx\.?)$/, "approx"],
];

const AMOUNT = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?`;
const UNIT_TEXT = `[a-z%"'.]+(?: ?[a-z.]+)?`;

/** Lowercase, ASCII quotes and dashes, single spaces. */
export function normalizeSpecText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[″“”]/g, '"')
    .replace(/[′’‘]/g, "'")
    .replace(/[×✕✖]/g, "x")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(\w)-(hours?)\b/g, "$1 $2")
    .replace(/(\d+(?:\.\d+)?)k(?= ?(?:mah|milliamp))/g, (_, n: string) =>
      toText(mul(decOf(n), decOf(1000))),
    );
}

function readAmount(text: string): number | null {
  if (!new RegExp(`^${AMOUNT}$`).test(text) || !/\d/.test(text)) return null;
  const d = dec(text.replace(/,/g, ""));
  if (d === null) return null;
  const v = toNumber(d);
  return Number.isFinite(v) ? v : null;
}

function readUnit(text: string, hint: ParseHint): Unit | null {
  const t = text.trim();
  for (const [re, unit] of UNIT_WORDS) {
    if (!re.test(t)) continue;
    const resolved =
      unit === "oz" && hint.dimension === "volume" ? "fl_oz" : unit;
    if (hint.dimension && dimensionOf(resolved) !== hint.dimension) return null;
    return resolved;
  }
  return null;
}

function stripQualifiers(text: string): {
  rest: string;
  qualifier?: Qualifier;
} {
  for (const [re, qualifier] of PREFIX_QUALIFIERS) {
    if (re.test(text)) return { rest: text.replace(re, ""), qualifier };
  }
  for (const [re, qualifier] of SUFFIX_QUALIFIERS) {
    if (re.test(text)) return { rest: text.replace(re, ""), qualifier };
  }
  return { rest: text };
}

function quantity(value: number, unit: Unit, qualifier?: Qualifier): Quantity {
  return qualifier ? { value, unit, qualifier } : { value, unit };
}

function bareUnit(hint: ParseHint): Unit | null {
  if (!hint.defaultUnit) return null;
  if (hint.dimension && dimensionOf(hint.defaultUnit) !== hint.dimension) {
    return null;
  }
  return hint.defaultUnit;
}

/**
 * One quantity: `65W`, `65 watts`, `up to 90 W`, `46.5"`, `118 cm`,
 * `20,000mAh`, `3.4 oz`, `100ml`, `5'10"`. Qualifiers are kept.
 */
export function parseQuantity(
  text: string,
  hint: ParseHint = {},
): Quantity | null {
  if (typeof text !== "string" || text.length > 200) return null;
  const { rest, qualifier } = stripQualifiers(normalizeSpecText(text));

  const feetInches = /^(\d+)' ?(\d+(?:\.\d+)?)(?:"|in)?$/.exec(rest);
  if (feetInches) {
    if (hint.dimension && hint.dimension !== "length") return null;
    const inches = Number(feetInches[1]) * 12 + Number(feetInches[2]);
    return quantity(inches, "in", qualifier);
  }

  const m = new RegExp(`^(${AMOUNT}) ?(${UNIT_TEXT})?$`).exec(rest);
  if (!m?.[1]) return null;
  const value = readAmount(m[1]);
  if (value === null) return null;
  const unit = m[2] === undefined ? bareUnit(hint) : readUnit(m[2], hint);
  return unit === null ? null : quantity(value, unit, qualifier);
}

/**
 * An inclusive range: `100-240V`, `100 V – 240 V`, `10 to 20 W`,
 * `between 35 and 36.5 in`. A unit on one end applies to both; mixed units
 * of the same dimension are kept as written.
 */
export function parseRange(text: string, hint: ParseHint = {}): Range | null {
  if (typeof text !== "string" || text.length > 200) return null;
  const t = normalizeSpecText(text);
  const m =
    new RegExp(
      `^(${AMOUNT}) ?(${UNIT_TEXT})? ?(?:-|to) ?(${AMOUNT}) ?(${UNIT_TEXT})$`,
    ).exec(t) ??
    new RegExp(
      `^between (${AMOUNT}) ?(${UNIT_TEXT})? and (${AMOUNT}) ?(${UNIT_TEXT})$`,
    ).exec(t);
  if (!m?.[1] || !m[3] || !m[4]) return null;
  const lo = readAmount(m[1]);
  const hi = readAmount(m[3]);
  const hiUnit = readUnit(m[4], hint);
  const loUnit = m[2] === undefined ? hiUnit : readUnit(m[2], hint);
  if (lo === null || hi === null || !hiUnit || !loUnit) return null;
  if (dimensionOf(loUnit) !== dimensionOf(hiUnit)) return null;
  const min = quantity(lo, loUnit);
  const max = quantity(hi, hiUnit);
  const order = compareQuantity(min, max);
  return order !== null && order <= 0 ? { min, max } : null;
}

/**
 * Three lengths: `21.5 x 14 x 9 in`, `21.5" x 14" x 9"`, `55x35x23cm`.
 * Each axis may carry the unit; otherwise the last unit (or the hint's
 * default) applies to all three. Mixed units are rejected.
 */
export function parseBox(text: string, hint: ParseHint = {}): Box | null {
  if (typeof text !== "string" || text.length > 200) return null;
  if (hint.dimension && hint.dimension !== "length") return null;
  const parts = normalizeSpecText(text).split(/ ?x ?/);
  if (parts.length !== 3) return null;
  const dims: number[] = [];
  const units = new Set<Unit>();
  for (const part of parts) {
    const m = new RegExp(`^(${AMOUNT}) ?(${UNIT_TEXT})?$`).exec(part);
    if (!m?.[1]) return null;
    const v = readAmount(m[1]);
    if (v === null || v <= 0) return null;
    dims.push(v);
    if (m[2] !== undefined) {
      const u = readUnit(m[2], { dimension: "length" });
      if (!u) return null;
      units.add(u);
    }
  }
  if (units.size > 1) return null;
  const unit = [...units][0] ?? bareUnit({ ...hint, dimension: "length" });
  if (!unit) return null;
  return { dims: dims as [number, number, number], unit };
}

/** Tries a box, then a range, then a single quantity. */
export function parseMeasure(
  text: string,
  hint: ParseHint = {},
): Quantity | Range | Box | null {
  return (
    parseBox(text, hint) ?? parseRange(text, hint) ?? parseQuantity(text, hint)
  );
}
