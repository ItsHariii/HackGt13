import { z } from "zod";

/**
 * Evidence strength, strongest first (SDD §7.3). The array order is the
 * lattice order; use `evidenceRank` rather than comparing strings.
 */
export const EVIDENCE_STATES = [
  "verified",
  "source_stated",
  "supported",
  "estimated",
  "unknown",
] as const;
export const EvidenceState = z.enum(EVIDENCE_STATES);
export type EvidenceState = z.infer<typeof EvidenceState>;

/** Higher is stronger: verified = 4 … unknown = 0. */
export function evidenceRank(state: EvidenceState): number {
  return EVIDENCE_STATES.length - 1 - EVIDENCE_STATES.indexOf(state);
}

/** Why a verdict or fact is not a clean pass. Keys for explanation templates. */
export const ReasonCode = z.enum([
  "not_satisfied",
  "insufficient_evidence",
  "no_fact",
  "stale",
  "conflict",
  "subjective",
  "role_missing",
  "total_mismatch",
  "incomparable",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const Verdict = z.enum(["pass", "fail", "unknown"]);
export type Verdict = z.infer<typeof Verdict>;

export const Importance = z.enum(["hard", "preference"]);
export type Importance = z.infer<typeof Importance>;

/** `sha256:` followed by 64 lowercase hex digits. */
export const Hash = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<64 hex>");
export type Hash = z.infer<typeof Hash>;

export const SemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "expected semver");

/** Dotted, lowercase field path: `monitor.usb_c_pd_watts`, `basket.delivered_total`. */
export const FieldRef = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/,
    "expected a dotted field path like monitor.usb_c_pd_watts",
  );
export type FieldRef = z.infer<typeof FieldRef>;

export const Role = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected a role id");

/** Absolute http(s) URL; rejects `javascript:`, `data:` and friends. */
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const IsoDate = z.iso.date();
export const IsoDateTime = z.iso.datetime({ offset: true });

/** ISO 4217 alphabetic code. */
export const Currency = z.string().regex(/^[A-Z]{3}$/, "expected ISO 4217");
export type Currency = z.infer<typeof Currency>;

/** Money is never a float: integer minor units plus a currency (SDD §8.2). */
export const MinorUnits = z.number().int().refine(Number.isSafeInteger, {
  message: "amount exceeds safe integer range",
});
export const NonNegativeMinor = MinorUnits.refine((n) => n >= 0, {
  message: "amount must be non-negative",
});

export const Money = z.strictObject({
  amountMinor: MinorUnits,
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

/**
 * Units the parser may emit. Base units per dimension are listed first; the
 * engine converts everything else to them before comparing.
 */
export const UNIT_DIMENSION = {
  mm: "length",
  cm: "length",
  m: "length",
  in: "length",
  ft: "length",
  g: "mass",
  kg: "mass",
  oz: "mass",
  lb: "mass",
  W: "power",
  Wh: "energy",
  mAh: "charge",
  ml: "volume",
  l: "volume",
  fl_oz: "volume",
  V: "voltage",
  pct: "ratio",
  day: "duration",
  count: "count",
} as const;
export type Unit = keyof typeof UNIT_DIMENSION;
export type Dimension = (typeof UNIT_DIMENSION)[Unit];
export const Unit = z.enum(Object.keys(UNIT_DIMENSION) as [Unit, ...Unit[]]);

/** Qualifiers are preserved from source text and may cap evidence state. */
export const Qualifier = z.enum(["up_to", "approx", "max", "min"]);
export type Qualifier = z.infer<typeof Qualifier>;

export const Quantity = z.strictObject({
  value: z.number().refine(Number.isFinite, { message: "must be finite" }),
  unit: Unit,
  qualifier: Qualifier.optional(),
});
export type Quantity = z.infer<typeof Quantity>;

const RangeEnd = z.union([Quantity, Money, IsoDate, z.number()]);

function rangeEndKind(end: z.infer<typeof RangeEnd>): string {
  if (typeof end !== "object") return typeof end;
  return "unit" in end
    ? `quantity:${UNIT_DIMENSION[end.unit]}`
    : `money:${end.currency}`;
}

/**
 * Inclusive bounds for `between`. Both ends must be the same kind: same
 * dimension for quantities, same currency for money.
 */
export const Range = z
  .strictObject({ min: RangeEnd, max: RangeEnd })
  .refine((r) => rangeEndKind(r.min) === rangeEndKind(r.max), {
    message: "range ends must be the same kind",
  });
export type Range = z.infer<typeof Range>;

/**
 * Three length measurements of a box-shaped item (a bag, a desk footprint).
 * Order is not significant: a fit check sorts both triples before comparing
 * axis by axis, so the item may be turned any way.
 */
export const Box = z
  .strictObject({
    dims: z.tuple([z.number(), z.number(), z.number()]),
    unit: Unit,
  })
  .refine((b) => b.dims.every((d) => Number.isFinite(d) && d > 0), {
    message: "box dimensions must be positive",
  })
  .refine((b) => UNIT_DIMENSION[b.unit] === "length", {
    message: "box dimensions need a length unit",
  });
export type Box = z.infer<typeof Box>;

/**
 * A typed requirement target or observed fact value. Dates travel as ISO
 * strings; the field's pack dimension says how to read them.
 */
export const Value = z.union([
  Quantity,
  Box,
  Money,
  Range,
  z.boolean(),
  z.number().refine(Number.isFinite, { message: "must be finite" }),
  z.array(z.string()),
  z.string(),
]);
export type Value = z.infer<typeof Value>;
