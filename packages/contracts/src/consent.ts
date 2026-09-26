import { z } from "zod";
import {
  FieldRef,
  Hash,
  Importance,
  IsoDate,
  IsoDateTime,
  MinorUnits,
  NonNegativeMinor,
  Role,
  Value,
  Verdict,
} from "./primitives";

/** How the policy treats one change (SDD §7.6). */
export const ChangeClass = z.enum(["info", "auto", "reapprove", "block"]);
export type ChangeClass = z.infer<typeof ChangeClass>;

export const DiffClassification = z.enum([
  "identical",
  "auto",
  "reapprove",
  "block",
]);
export type DiffClassification = z.infer<typeof DiffClassification>;

const classification = {
  class: ChangeClass,
  /** The policy rule that decided the class, e.g. `floor.sku`, `balanced.total_increase`. */
  basis: z.string().min(1),
};

const identity = z.strictObject({
  kind: z.literal("identity"),
  role: Role,
  attribute: z.enum(["sku", "variant", "gtin", "seller", "merchant", "qty"]),
  before: z.union([z.string(), z.number()]).nullable(),
  after: z.union([z.string(), z.number()]).nullable(),
});

const verdict = z.strictObject({
  kind: z.literal("verdict"),
  requirementId: z.string().min(1),
  importance: Importance,
  before: Verdict,
  after: Verdict,
});

const fact = z.strictObject({
  kind: z.literal("fact"),
  role: Role,
  field: FieldRef,
  before: Value.nullable(),
  after: Value.nullable(),
  /** Whether a hard requirement reads this field. */
  hardField: z.boolean(),
});

const economics = z.strictObject({
  kind: z.literal("economics"),
  attribute: z.enum(["unit_price", "shipping", "tax", "total"]),
  role: Role.optional(),
  beforeMinor: MinorUnits,
  afterMinor: MinorUnits,
});

const delivery = z.strictObject({
  kind: z.literal("delivery"),
  role: Role,
  before: IsoDate.nullable(),
  after: IsoDate.nullable(),
  withinDeadline: z.boolean(),
});

const terms = z.strictObject({
  kind: z.literal("terms"),
  role: Role,
  attribute: z.enum(["final_sale", "return_window", "return_fee"]),
  before: z.union([z.boolean(), z.number()]),
  after: z.union([z.boolean(), z.number()]),
  direction: z.enum(["improved", "worsened"]),
});

const recurring = z.strictObject({
  kind: z.literal("recurring"),
  role: Role,
  before: z.string().nullable(),
  after: z.string().nullable(),
});

/** One difference between the approved contract and the live checkout. */
export const Change = z.discriminatedUnion("kind", [
  identity,
  verdict,
  fact,
  economics,
  delivery,
  terms,
  recurring,
]);
export type Change = z.infer<typeof Change>;

export const ClassifiedChange = z.discriminatedUnion("kind", [
  identity.extend(classification),
  verdict.extend(classification),
  fact.extend(classification),
  economics.extend(classification),
  delivery.extend(classification),
  terms.extend(classification),
  recurring.extend(classification),
]);
export type ClassifiedChange = z.infer<typeof ClassifiedChange>;

const SEVERITY: Record<ChangeClass, DiffClassification> = {
  info: "identical",
  auto: "auto",
  reapprove: "reapprove",
  block: "block",
};
const ORDER: readonly DiffClassification[] = [
  "identical",
  "auto",
  "reapprove",
  "block",
];

/** The overall outcome is the most severe change; `info` alone is identical. */
export function maxSeverity(
  classes: Iterable<ChangeClass>,
): DiffClassification {
  let worst = 0;
  for (const c of classes) {
    worst = Math.max(worst, ORDER.indexOf(SEVERITY[c]));
  }
  return ORDER[worst] ?? "identical";
}

export const DIFF_SCHEMA = "cartel.diff/1";

/** Approved state vs live state, each change classified (SDD §7.7). */
export const ConsentDiff = z
  .strictObject({
    schema: z.literal(DIFF_SCHEMA),
    contractHash: Hash,
    classification: DiffClassification,
    changes: z.array(ClassifiedChange),
    reproofHash: Hash,
    currentTotalMinor: NonNegativeMinor,
    evaluatedAt: IsoDateTime,
  })
  .refine(
    (d) => d.classification === maxSeverity(d.changes.map((c) => c.class)),
    {
      path: ["classification"],
      message: "classification must equal the most severe change",
    },
  );
export type ConsentDiff = z.infer<typeof ConsentDiff>;
