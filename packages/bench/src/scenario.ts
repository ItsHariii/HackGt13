import {
  AutonomyPreset,
  Availability,
  DiffClassification,
  EvidenceState,
  ReasonCode,
  Value,
  Verdict,
} from "@cartel/contracts";
import { AUTHORITIES } from "@cartel/proof-engine";
import { z } from "zod";

/*
 * ProofBench scenario format (SDD §22.2, TASKS T16.1). A scenario names a
 * signed basket (`world`), a mutation of the live checkout, and what the
 * guard must conclude. Scenarios live as JSON under `scenarios/<category>/`.
 */

export const CATEGORIES = [
  "identity",
  "same-sku-facts",
  "economics",
  "terms",
  "delivery",
  "availability",
  "recurring",
  "evidence",
  "derived",
  "security",
  "benign",
] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const CATEGORY_LABELS: Record<Category, string> = {
  identity: "Identity",
  "same-sku-facts": "Same-SKU facts",
  economics: "Economics",
  terms: "Terms",
  delivery: "Delivery",
  availability: "Availability",
  recurring: "Recurring",
  evidence: "Evidence",
  derived: "Derived",
  security: "Security",
  benign: "Benign",
};

/** SDD §22.2 minimum count per category (62 in all). */
export const CATEGORY_MINIMUMS: Record<Category, number> = {
  identity: 8,
  "same-sku-facts": 8,
  economics: 8,
  terms: 6,
  delivery: 4,
  availability: 3,
  recurring: 3,
  evidence: 8,
  derived: 4,
  security: 5,
  benign: 5,
};

const Role = z.string().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTime = z.iso.datetime();

/** Fields of a product fact a mutation may set. */
const FactPatch = z.strictObject({
  id: z.string().min(1).optional(),
  value: Value.nullable().optional(),
  state: EvidenceState.optional(),
  reason: ReasonCode.optional(),
  conflict: z.boolean().optional(),
  raw: z.string().optional(),
  sourceId: z.string().min(1).optional(),
  retrievedAt: IsoDateTime.optional(),
  freshUntil: IsoDateTime.optional(),
});

/** One edit to the live checkout, applied in order. */
export const Op = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("price"),
    role: Role,
    minor: z.number().int().nonnegative(),
  }),
  z.strictObject({
    op: z.literal("offer"),
    role: Role,
    set: z
      .strictObject({
        sku: z.string().min(1),
        gtin: z.string().min(1),
        variant: z.string().min(1),
        sellerId: z.string().min(1),
        merchant: z.string().min(1),
        title: z.string().min(1),
        availability: Availability,
        deliveryBy: IsoDate,
        recurring: z.string().min(1),
      })
      .partial(),
  }),
  z.strictObject({
    op: z.literal("terms"),
    role: Role,
    set: z
      .strictObject({
        finalSale: z.boolean(),
        returnWindowDays: z.number().int().nonnegative(),
        returnFeeMinor: z.number().int().nonnegative(),
      })
      .partial(),
  }),
  z.strictObject({
    op: z.literal("qty"),
    role: Role,
    qty: z.number().int().positive(),
  }),
  z.strictObject({ op: z.literal("swap"), role: Role, to: z.string().min(1) }),
  z.strictObject({ op: z.literal("add_line"), role: Role, from: z.string() }),
  z.strictObject({ op: z.literal("remove_line"), role: Role }),
  z.strictObject({
    op: z.literal("fact"),
    role: Role,
    field: z.string().min(1),
    set: FactPatch,
  }),
  z.strictObject({
    op: z.literal("add_fact"),
    role: Role,
    field: z.string().min(1),
    fact: FactPatch.extend({
      id: z.string().min(1),
      value: Value.nullable(),
    }),
  }),
  z.strictObject({
    op: z.literal("remove_fact"),
    role: Role,
    field: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal("source"),
    sourceId: z.string().min(1),
    authority: z.enum(AUTHORITIES),
  }),
  z.strictObject({
    op: z.literal("checkout"),
    set: z
      .strictObject({
        shippingMinor: z.number().int().nonnegative(),
        taxRate: z.string().regex(/^\d+(\.\d+)?$/),
        quotedTotalMinor: z.number().int().nonnegative(),
      })
      .partial(),
  }),
  z.strictObject({
    op: z.literal("order"),
    field: z.string().min(1),
    value: z.boolean(),
  }),
]);
export type Op = z.infer<typeof Op>;

const base = {
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  name: z.string().min(1),
  category: Category,
};

/** A checkout mutation after signing, judged by the Consent Diff. */
export const ConsentScenario = z.strictObject({
  ...base,
  kind: z.literal("consent").default("consent"),
  world: z.enum(["flagship", "wedding", "carry-on"]),
  preset: AutonomyPreset.default("balanced"),
  /** When the live checkout is read; defaults to the world's signing time. */
  at: IsoDateTime.optional(),
  mutation: z.array(Op),
  expected: z.strictObject({
    classification: DiffClassification,
    /** Verdicts the re-proof must reach, by requirement ID. */
    verdicts: z.record(z.string(), Verdict).optional(),
    /** Policy bases that must appear among the classified changes. */
    bases: z.array(z.string().min(1)).optional(),
  }),
});
export type ConsentScenario = z.infer<typeof ConsentScenario>;

/** A signed agent request presented to the merchant (TAP, RFC 9421). */
export const AgentScenario = z.strictObject({
  ...base,
  kind: z.literal("agent_request"),
  attack: z.enum([
    "none",
    "unsigned",
    "replay_nonce",
    "tampered_body",
    "expired",
    "unknown_key",
    "wrong_tag",
  ]),
  expected: z.strictObject({
    accepted: z.boolean(),
    reason: z.string().min(1).optional(),
  }),
});
export type AgentScenario = z.infer<typeof AgentScenario>;

export const Scenario = z.union([ConsentScenario, AgentScenario]);
export type Scenario = z.infer<typeof Scenario>;

/** Whether the mutation must stop payment: re-approval or a block. */
export function isMaterial(s: Scenario): boolean {
  return s.kind === "agent_request"
    ? !s.expected.accepted
    : s.expected.classification === "reapprove" ||
        s.expected.classification === "block";
}
