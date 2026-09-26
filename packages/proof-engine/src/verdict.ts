import type {
  EvidenceState,
  Operator,
  ReasonCode,
  Requirement,
  Value,
  Verdict,
} from "@proofcart/contracts";
import { atLeast, type Resolved } from "./evidence";
import type { FieldDef } from "./fields";
import { boxFits, compareQuantity } from "./units";
import {
  compareScalar,
  isBox,
  isIsoDate,
  isQuantity,
  isRange,
  isScalar,
  isStringList,
  normalizeText,
  sameValue,
} from "./values";

/**
 * Whether `observed` satisfies `op target`: true, false, or null when the two
 * can't be compared (different dimensions, currencies or shapes). Null never
 * becomes a failure; it surfaces as `unknown (incomparable)`.
 */
export function satisfies(
  op: Operator,
  observed: Value,
  target: Value,
  def?: FieldDef,
): boolean | null {
  switch (op) {
    case "eq":
      return equal(observed, target, def);
    case "neq": {
      const eq = equal(observed, target, def);
      return eq === null ? null : !eq;
    }
    case "gte":
    case "lte":
      return ordered(op, observed, target, def);
    case "before": {
      if (!isIsoDate(observed) || !isIsoDate(target)) return null;
      return Date.parse(observed) < Date.parse(target);
    }
    case "between":
      return between(observed, target, def);
    case "in":
    case "not_in": {
      if (!isStringList(target)) return null;
      const allowed = new Set(target.map((t) => normalizeText(t, def)));
      const values =
        typeof observed === "string"
          ? [observed]
          : isStringList(observed)
            ? observed
            : null;
      if (!values || values.length === 0) return null;
      const hits = values.map((v) => allowed.has(normalizeText(v, def)));
      return op === "in" ? hits.every(Boolean) : !hits.some(Boolean);
    }
    case "contains":
    case "excludes":
      return membership(op, observed, target, def);
    case "compatible_with":
      return typeof observed === "boolean" ? observed : null;
    case "exists":
      return typeof target === "boolean" ? target : null;
  }
}

function equal(a: Value, b: Value, def?: FieldDef): boolean | null {
  const kindsMatch =
    (isQuantity(a) && isQuantity(b)) ||
    (isBox(a) && isBox(b)) ||
    (isRange(a) && isRange(b)) ||
    (isStringList(a) && isStringList(b)) ||
    (isScalar(a) && isScalar(b)) ||
    (typeof a !== "object" && typeof a === typeof b);
  if (!kindsMatch) return null;
  if (isScalar(a) && isScalar(b) && compareScalar(a, b, def) === null)
    return null;
  if (isQuantity(a) && isQuantity(b) && compareQuantity(a, b) === null)
    return null;
  return sameValue(a, b, def);
}

function ordered(
  op: "gte" | "lte",
  a: Value,
  b: Value,
  def?: FieldDef,
): boolean | null {
  if (isBox(a) && isBox(b)) {
    // lte on boxes: fits inside the limit in some orientation.
    if (op === "lte") return boxFits(a, b, def?.tolerance)?.fits ?? null;
    const r = boxFits(b, a, def?.tolerance);
    return r ? r.fits : null;
  }
  if (!isScalar(a) || !isScalar(b)) return null;
  const c = compareScalar(a, b, def);
  if (c === null) return null;
  return op === "gte" ? c >= 0 : c <= 0;
}

function between(a: Value, target: Value, def?: FieldDef): boolean | null {
  if (!isRange(target)) return null;
  const { min, max } = target;
  if (isRange(a)) {
    const lo = between(a.min as Value, target, def);
    const hi = between(a.max as Value, target, def);
    return lo === null || hi === null ? null : lo && hi;
  }
  if (!isScalar(a) || !isScalar(min) || !isScalar(max)) return null;
  const lo = compareScalar(a, min, def);
  const hi = compareScalar(a, max, def);
  return lo === null || hi === null ? null : lo >= 0 && hi <= 0;
}

function membership(
  op: "contains" | "excludes",
  observed: Value,
  target: Value,
  def?: FieldDef,
): boolean | null {
  if (isRange(observed) && op === "contains") {
    // A stated range (100–240 V input) contains the target value or range.
    if (isRange(target)) {
      const lo = between(target.min as Value, observed, def);
      const hi = between(target.max as Value, observed, def);
      return lo === null || hi === null ? null : lo && hi;
    }
    return between(target, observed, def);
  }
  if (!isStringList(observed)) return null;
  const wanted =
    typeof target === "string"
      ? [target]
      : isStringList(target)
        ? target
        : null;
  if (!wanted || wanted.length === 0) return null;
  const have = new Set(observed.map((o) => normalizeText(o, def)));
  const hits = wanted.map((w) => have.has(normalizeText(w, def)));
  return op === "contains" ? hits.every(Boolean) : !hits.some(Boolean);
}

export type Judgement = {
  verdict: Verdict;
  reason: ReasonCode | null;
  evidenceState: EvidenceState;
};

/**
 * The verdict rule (SDD §7.4): **weak evidence can fail a requirement; only
 * strong evidence can pass it.**
 *
 * | fact                                      | verdict                          |
 * |-------------------------------------------|----------------------------------|
 * | satisfies, state ≥ minStateToPass         | pass                             |
 * | violates, state ≥ estimated               | fail (not_satisfied)             |
 * | satisfies, state < minStateToPass         | unknown (insufficient_evidence)  |
 * | missing, stale, conflict, subjective      | unknown (that reason)            |
 * | not comparable with the target            | unknown (incomparable)           |
 */
export function judge(
  requirement: Pick<Requirement, "op" | "target" | "evidence">,
  fact: Resolved,
  def?: FieldDef,
): Judgement {
  const state = fact.state;
  if (state === "unknown" || fact.value === null) {
    return {
      verdict: "unknown",
      reason: fact.reason ?? "no_fact",
      evidenceState: "unknown",
    };
  }
  const ok = satisfies(requirement.op, fact.value, requirement.target, def);
  if (ok === null)
    return { verdict: "unknown", reason: "incomparable", evidenceState: state };
  if (!ok)
    return { verdict: "fail", reason: "not_satisfied", evidenceState: state };
  if (!atLeast(state, requirement.evidence.minStateToPass)) {
    return {
      verdict: "unknown",
      reason: "insufficient_evidence",
      evidenceState: state,
    };
  }
  return { verdict: "pass", reason: null, evidenceState: state };
}
