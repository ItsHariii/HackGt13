import {
  canonicalize,
  effectiveImportance,
  type ProofReport,
  type ProofResult,
  REPORT_SCHEMA,
  type ReasonCode,
  type Requirement,
  reportHash,
  type ScopeRef,
  summarize,
  type Verdict,
  type Waiver,
} from "@proofcart/contracts";
import { type Resolved, unknownResolved } from "./evidence";
import { judge } from "./verdict";
import { buildView, type EvaluationInput, type View } from "./view";

/** Bumped when a change to the engine could change any verdict. */
export const ENGINE_VERSION = "1.0.0";

/**
 * Evaluates every requirement in its scope (SDD §7.2, §8.1): item (each line
 * of the role), pair (each combination of the two roles), basket, merchant
 * (each store used) and order. Pure and synchronous, so the solver and the
 * browser can call it in a loop. Results come back in canonical order, so
 * the order of any input array never changes the output.
 */
export function evaluateResults(input: EvaluationInput): ProofResult[] {
  const view = buildView(input);
  const results: ProofResult[] = [];
  for (const req of input.requirements) {
    for (const [scope, resolved] of scopedFacts(req, view)) {
      results.push(toResult(req, scope, resolved, view));
    }
  }
  return results.sort(compareResults);
}

function* scopedFacts(
  req: Requirement,
  view: View,
): Generator<[ScopeRef, Resolved]> {
  switch (req.scope) {
    case "item": {
      const role = req.role as string;
      const lines = view.items.filter((i) => i.role === role);
      if (lines.length === 0) {
        yield [
          { kind: "item", role, offerId: null },
          unknownResolved("role_missing"),
        ];
      }
      for (const item of lines) {
        yield [
          { kind: "item", role, offerId: item.offer.id },
          item.get(req.field),
        ];
      }
      return;
    }
    case "pair": {
      const [ra, rb] = [req.role as string, req.pairRole as string];
      const as = view.items.filter((i) => i.role === ra);
      const bs = view.items.filter((i) => i.role === rb);
      // With either role absent there is no pair to check. Whether the role
      // must be present is the job of `basket.missing_roles`, not this rule.
      for (const a of as) {
        for (const b of bs) {
          const scope: ScopeRef = {
            kind: "pair",
            roles: [ra, rb],
            offerIds: [a.offer.id, b.offer.id],
          };
          yield [
            scope,
            view.pair(req.field, a, b) ?? unknownResolved("incomparable"),
          ];
        }
      }
      return;
    }
    case "basket":
      yield [{ kind: "basket" }, view.basket.get(req.field)];
      return;
    case "merchant":
      for (const m of view.merchants) {
        yield [{ kind: "merchant", merchant: m }, view.merchant(m, req.field)];
      }
      return;
    case "order":
      yield [{ kind: "order" }, view.order(req.field)];
      return;
  }
}

function toResult(
  req: Requirement,
  scope: ScopeRef,
  resolved: Resolved,
  view: View,
): ProofResult {
  const j = judge(req, resolved, view.def(req.field));
  return {
    requirementId: req.id,
    scope,
    importance: effectiveImportance(req),
    verdict: j.verdict,
    observed: resolved.value,
    target: { op: req.op, value: req.target },
    evidenceState: j.evidenceState,
    factIds: resolved.factIds,
    reason: j.reason,
  };
}

/** Stable identity of a result across evaluations: requirement plus scope. */
export function resultKey(
  r: Pick<ProofResult, "requirementId" | "scope">,
): string {
  return `${r.requirementId}\u0000${canonicalize(r.scope)}`;
}

function compareResults(a: ProofResult, b: ProofResult): number {
  const x = resultKey(a);
  const y = resultKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * The full, hashed report (SDD §8.4). `packs` records the version of every
 * pack supplied, so the report can be replayed later with the same rules.
 */
export async function evaluate(input: EvaluationInput): Promise<ProofReport> {
  return buildReport(evaluateResults(input), input);
}

export async function buildReport(
  results: readonly ProofResult[],
  input: Pick<EvaluationInput, "packs" | "now">,
): Promise<ProofReport> {
  const sorted = [...results].sort(compareResults);
  const body = {
    schema: REPORT_SCHEMA,
    engineVersion: ENGINE_VERSION,
    packs: Object.fromEntries(
      [...input.packs]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((p) => [p.id, p.version]),
    ),
    evaluatedAt: input.now,
    summary: summarize(sorted),
    results: sorted,
  } satisfies Omit<ProofReport, "hash">;
  return { ...body, hash: await reportHash(body) };
}

export type SignBlocker = {
  requirementId: string;
  scope: ScopeRef;
  verdict: Exclude<Verdict, "pass">;
  reason: ReasonCode | null;
  /** Only an unknown with a matching waiver may proceed; a fail must be edited. */
  waivable: boolean;
};

/**
 * The signing gate (SDD §7.4): every hard requirement is `pass`, or
 * `unknown` with an explicit waiver for that requirement and reason. A hard
 * `fail` can never be waived.
 */
export function signGate(
  report: Pick<ProofReport, "results">,
  waivers: readonly Waiver[],
): { ok: boolean; blockers: SignBlocker[] } {
  const blockers: SignBlocker[] = [];
  for (const r of report.results) {
    if (r.importance !== "hard" || r.verdict === "pass") continue;
    const waived =
      r.verdict === "unknown" &&
      waivers.some(
        (w) => w.requirementId === r.requirementId && w.reason === r.reason,
      );
    if (waived) continue;
    blockers.push({
      requirementId: r.requirementId,
      scope: r.scope,
      verdict: r.verdict,
      reason: r.reason,
      waivable: r.verdict === "unknown",
    });
  }
  return { ok: blockers.length === 0, blockers };
}
