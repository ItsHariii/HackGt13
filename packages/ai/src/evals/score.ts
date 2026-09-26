import { effectiveImportance, type Requirement } from "@proofcart/contracts";
import { fieldDef, type Pack, sameValue } from "@proofcart/proof-engine";
import type { AiCallRecord } from "../calls";
import {
  draftRequirements,
  type RequirementSet,
  targetFor,
} from "../requirements";
import type { AiRunner } from "../router";
import type { EvalCase, Expectation, ExpectedHard } from "./cases";

/*
 * Field-level precision and recall on hard requirements (TASKS T9.6). A hit
 * is a hard requirement on the expected field (and role, when the case names
 * one); an exact hit also has the expected operator and value. The target is
 * ≥ 0.9 for both field-level numbers.
 */

export const EVAL_TARGET = 0.9;

export type CaseScore = {
  id: string;
  pack: string;
  detectedPack: string | null;
  expected: number;
  actual: number;
  fieldHits: number;
  exactHits: number;
  assumedExpected: number;
  assumedHits: number;
  /** Expected hard requirements with no field-level match. */
  missing: string[];
  /** Hard requirements that matched nothing expected. */
  extra: string[];
  dropped: number;
  questions: number;
  error: string | null;
  call: AiCallRecord | null;
};

function readings(e: ExpectedHard): readonly Expectation[] {
  return [e, ...(e.alt ?? [])];
}

function onField(r: Requirement, x: Expectation): boolean {
  return r.field === x.field && (x.role === undefined || r.role === x.role);
}

function exactly(
  r: Requirement,
  x: Expectation,
  packs: readonly Pack[],
): boolean {
  if (!onField(r, x)) return false;
  if (x.op !== undefined && r.op !== x.op) return false;
  if (x.value === undefined) return true;
  const def = fieldDef(x.field, packs);
  if (!def) return false;
  const target = targetFor(
    {
      field: x.field,
      role: x.role ?? null,
      op: x.op ?? r.op,
      value: x.value,
      importance: "hard",
      weight: null,
      quote: null,
      rationale: "",
    },
    def,
  );
  return target !== null && sameValue(r.target, target, def);
}

/** Greedy one-to-one assignment of requirements to expectations. */
function assign(
  actual: readonly Requirement[],
  expected: readonly ExpectedHard[],
  match: (r: Requirement, x: Expectation) => boolean,
): { hits: number; unmatchedExpected: ExpectedHard[]; used: Set<number> } {
  const used = new Set<number>();
  const unmatchedExpected: ExpectedHard[] = [];
  for (const e of expected) {
    const at = actual.findIndex(
      (r, i) => !used.has(i) && readings(e).some((x) => match(r, x)),
    );
    if (at < 0) unmatchedExpected.push(e);
    else used.add(at);
  }
  return { hits: used.size, unmatchedExpected, used };
}

export function scoreCase(
  c: EvalCase,
  set: RequirementSet,
  packs: readonly Pack[],
): Omit<CaseScore, "error" | "call"> {
  const hard = set.requirements.filter(
    (r) => effectiveImportance(r) === "hard",
  );
  const byField = assign(hard, c.hard, onField);
  const byValue = assign(hard, c.hard, (r, x) => exactly(r, x, packs));
  const inferred = new Set(
    set.requirements
      .filter((r) => r.provenance.kind === "ai_inferred")
      .map((r) => r.field),
  );
  const assumed = c.assumed ?? [];
  return {
    id: c.id,
    pack: c.pack,
    detectedPack: set.pack,
    expected: c.hard.length,
    actual: hard.length,
    fieldHits: byField.hits,
    exactHits: byValue.hits,
    assumedExpected: assumed.length,
    assumedHits: assumed.filter((f) => inferred.has(f)).length,
    missing: byField.unmatchedExpected.map((e) => e.field),
    extra: hard
      .filter((_, i) => !byField.used.has(i))
      .map((r) => `${r.field} ${r.op} ${JSON.stringify(r.target)}`),
    dropped: set.dropped.length,
    questions: set.questions.length,
  };
}

export type Rates = { precision: number; recall: number };

export type EvalSummary = {
  cases: number;
  errors: number;
  field: Rates;
  exact: Rates;
  packAccuracy: number;
  byPack: Record<string, { cases: number; field: Rates; exact: Rates }>;
  costUsdMicros: number;
  passed: boolean;
};

function ratio(hits: number, total: number): number {
  return total === 0 ? 1 : hits / total;
}

function rates(
  scores: readonly CaseScore[],
  hits: "fieldHits" | "exactHits",
): Rates {
  const h = scores.reduce((s, c) => s + c[hits], 0);
  return {
    precision: ratio(
      h,
      scores.reduce((s, c) => s + c.actual, 0),
    ),
    recall: ratio(
      h,
      scores.reduce((s, c) => s + c.expected, 0),
    ),
  };
}

/** Micro-averaged over every requirement, so long briefs weigh more. */
export function summarize(scores: readonly CaseScore[]): EvalSummary {
  const packs = [...new Set(scores.map((s) => s.pack))].sort();
  const byPack: EvalSummary["byPack"] = {};
  for (const pack of packs) {
    const of = scores.filter((s) => s.pack === pack);
    byPack[pack] = {
      cases: of.length,
      field: rates(of, "fieldHits"),
      exact: rates(of, "exactHits"),
    };
  }
  const field = rates(scores, "fieldHits");
  return {
    cases: scores.length,
    errors: scores.filter((s) => s.error !== null).length,
    field,
    exact: rates(scores, "exactHits"),
    packAccuracy: ratio(
      scores.filter((s) => s.detectedPack === s.pack).length,
      scores.length,
    ),
    byPack,
    costUsdMicros: scores.reduce((s, c) => s + (c.call?.costUsdMicros ?? 0), 0),
    passed: field.precision >= EVAL_TARGET && field.recall >= EVAL_TARGET,
  };
}

export type RunEvalOptions = {
  packs: readonly Pack[];
  concurrency?: number;
  onCase?: (score: CaseScore) => void;
};

/** Runs A1 over every case. A failed call scores as zero hits, not a skip. */
export async function runEval(
  router: AiRunner,
  cases: readonly EvalCase[],
  options: RunEvalOptions,
): Promise<{ scores: CaseScore[]; summary: EvalSummary }> {
  const scores: CaseScore[] = new Array(cases.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < cases.length; i = next++) {
      const c = cases[i] as EvalCase;
      let score: CaseScore;
      try {
        const { call, ...set } = await draftRequirements(router, {
          brief: c.brief,
          packs: options.packs,
          today: c.today,
        });
        score = { ...scoreCase(c, set, options.packs), error: null, call };
      } catch (error) {
        score = {
          ...scoreCase(
            c,
            { pack: null, requirements: [], questions: [], dropped: [] },
            options.packs,
          ),
          error: error instanceof Error ? error.message : String(error),
          call: null,
        };
      }
      scores[i] = score;
      options.onCase?.(score);
    }
  }
  const n = Math.max(1, Math.min(options.concurrency ?? 4, cases.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { scores, summary: summarize(scores) };
}
