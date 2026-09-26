import { z } from "zod";
import {
  EvidenceState,
  Hash,
  Importance,
  IsoDateTime,
  ReasonCode,
  Role,
  SemVer,
  Value,
  Verdict,
} from "./primitives";
import { Operator } from "./requirement";

/** What a single result was evaluated against. */
export const ScopeRef = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("item"),
    role: Role,
    offerId: z.string().min(1).nullable(),
  }),
  z.strictObject({
    kind: z.literal("pair"),
    roles: z.tuple([Role, Role]),
    offerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  }),
  z.strictObject({ kind: z.literal("basket") }),
  z.strictObject({ kind: z.literal("merchant"), merchant: z.string().min(1) }),
  z.strictObject({ kind: z.literal("order") }),
]);
export type ScopeRef = z.infer<typeof ScopeRef>;

/** One verdict for one requirement in one scope (SDD §8.1, §8.4). */
export const ProofResult = z
  .strictObject({
    requirementId: z.string().min(1),
    scope: ScopeRef,
    /** Effective importance, after the unconfirmed-assumption rule. */
    importance: Importance,
    verdict: Verdict,
    observed: Value.nullable(),
    target: z.strictObject({ op: Operator, value: Value }),
    evidenceState: EvidenceState,
    factIds: z.array(z.string().min(1)),
    reason: ReasonCode.nullable(),
  })
  .superRefine((r, ctx) => {
    if (r.verdict === "pass" && r.reason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "a pass carries no reason",
      });
    }
    if (r.verdict !== "pass" && r.reason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "fail and unknown need a reason code",
      });
    }
  });
export type ProofResult = z.infer<typeof ProofResult>;

const Count = z.number().int().nonnegative();

export const ProofSummary = z.strictObject({
  hard: z.strictObject({ pass: Count, fail: Count, unknown: Count }),
  preference: z.strictObject({ met: Count, unmet: Count, unknown: Count }),
});
export type ProofSummary = z.infer<typeof ProofSummary>;

export const PackVersions = z.record(z.string().min(1), SemVer);

export const REPORT_SCHEMA = "proofcart.report/1";

/** SDD §8.4. `hash` covers every other field (see `reportHash`). */
export const ProofReport = z
  .strictObject({
    schema: z.literal(REPORT_SCHEMA),
    engineVersion: SemVer,
    packs: PackVersions,
    evaluatedAt: IsoDateTime,
    summary: ProofSummary,
    results: z.array(ProofResult),
    hash: Hash,
  })
  .refine((r) => sameSummary(r.summary, summarize(r.results)), {
    path: ["summary"],
    message: "summary does not match results",
  });

function sameSummary(a: ProofSummary, b: ProofSummary): boolean {
  return (
    a.hard.pass === b.hard.pass &&
    a.hard.fail === b.hard.fail &&
    a.hard.unknown === b.hard.unknown &&
    a.preference.met === b.preference.met &&
    a.preference.unmet === b.preference.unmet &&
    a.preference.unknown === b.preference.unknown
  );
}
export type ProofReport = z.infer<typeof ProofReport>;

/** Counts results into the summary shape; the report builder and tests share it. */
export function summarize(results: readonly ProofResult[]): ProofSummary {
  const summary: ProofSummary = {
    hard: { pass: 0, fail: 0, unknown: 0 },
    preference: { met: 0, unmet: 0, unknown: 0 },
  };
  for (const r of results) {
    if (r.importance === "hard") summary.hard[r.verdict] += 1;
    else if (r.verdict === "pass") summary.preference.met += 1;
    else if (r.verdict === "fail") summary.preference.unmet += 1;
    else summary.preference.unknown += 1;
  }
  return summary;
}
