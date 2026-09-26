import { z } from "zod";
import { EvidenceState, FieldRef, Importance, Role, Value } from "./primitives";

export const Operator = z.enum([
  "eq",
  "neq",
  "gte",
  "lte",
  "between",
  "in",
  "not_in",
  "contains",
  "excludes",
  "before",
  "compatible_with",
  "exists",
]);
export type Operator = z.infer<typeof Operator>;

export const RequirementScope = z.enum([
  "item",
  "pair",
  "basket",
  "merchant",
  "order",
]);
export type RequirementScope = z.infer<typeof RequirementScope>;

export const Materiality = z.enum([
  "always",
  "on_verdict_change",
  "on_fact_change",
]);
export type Materiality = z.infer<typeof Materiality>;

/** [start, end) character offsets into the user's brief. */
export const TextSpan = z
  .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
  .refine(([start, end]) => start < end, { message: "empty or inverted span" });

/** Where a requirement came from. Drives the "You said / I assumed" labels. */
export const Provenance = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("user_stated"),
    quote: z.string().min(1),
    span: TextSpan,
  }),
  z.strictObject({
    kind: z.literal("ai_inferred"),
    rationale: z.string().min(1),
    confirmed: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("user_selected"),
    via: z.enum(["facet", "spec_row", "form"]),
    label: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("pack_default"),
    pack: z.string().min(1),
    ruleId: z.string().min(1),
  }),
]);
export type Provenance = z.infer<typeof Provenance>;
export type ProvenanceKind = Provenance["kind"];

/** SDD §7.2. */
export const Requirement = z
  .strictObject({
    id: z.string().min(1),
    scope: RequirementScope,
    role: Role.optional(),
    pairRole: Role.optional(),
    field: FieldRef,
    op: Operator,
    target: Value,
    importance: Importance,
    weight: z.number().min(0).max(1).optional(),
    evidence: z.strictObject({ minStateToPass: EvidenceState }),
    materiality: Materiality,
    provenance: Provenance,
  })
  .superRefine((r, ctx) => {
    if ((r.scope === "item" || r.scope === "pair") && !r.role) {
      ctx.addIssue({
        code: "custom",
        path: ["role"],
        message: `${r.scope} scope needs a role`,
      });
    }
    if ((r.scope === "pair") !== (r.pairRole !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["pairRole"],
        message: "pairRole is required for pair scope and only for pair scope",
      });
    }
    if (r.importance === "hard" && r.weight !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["weight"],
        message: "weight applies to preferences only",
      });
    }
    if (r.op === "between" && !isRange(r.target)) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "between needs a {min, max} target",
      });
    }
    if ((r.op === "in" || r.op === "not_in") && !Array.isArray(r.target)) {
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: `${r.op} needs a list target`,
      });
    }
  });
export type Requirement = z.infer<typeof Requirement>;

function isRange(v: Value): boolean {
  return typeof v === "object" && !Array.isArray(v) && "min" in v;
}

/**
 * The importance the engine must use. An unconfirmed AI assumption is never
 * hard, whatever its declared importance (SDD §7.2 invariant).
 */
export function effectiveImportance(r: Requirement): Importance {
  if (r.provenance.kind === "ai_inferred" && !r.provenance.confirmed) {
    return "preference";
  }
  return r.importance;
}

/**
 * A refinement proposed by the AI layer (A4) or the form, shown to the user
 * as a diff before it applies (SDD §10.1).
 */
export const RequirementPatch = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add"), requirement: Requirement }),
  z.strictObject({ op: z.literal("remove"), requirementId: z.string().min(1) }),
  z.strictObject({
    op: z.literal("replace"),
    requirementId: z.string().min(1),
    set: z
      .strictObject({
        op: Operator.optional(),
        target: Value.optional(),
        importance: Importance.optional(),
        weight: z.number().min(0).max(1).optional(),
      })
      .refine((s) => Object.keys(s).length > 0, {
        message: "replace must change at least one property",
      }),
  }),
]);
export type RequirementPatch = z.infer<typeof RequirementPatch>;
