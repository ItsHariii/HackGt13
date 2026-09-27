import {
  effectiveImportance,
  type Fact,
  type Offer,
  type Requirement,
} from "@cartel/contracts";
import {
  type EvaluationInput,
  evaluateResults,
  type Pack,
} from "@cartel/proof-engine";
import {
  EXHAUSTIVE_MAX_CANDIDATES_PER_ROLE,
  EXHAUSTIVE_MAX_ROLES,
  limitsFromRequirements,
  type SolverCandidate,
  type SolverProblem,
} from "@cartel/solver";

/*
 * A saved plan as a solver problem (SDD §9, TASKS T11.3). Pure, so it runs
 * the same in tests: which roles to fill, which candidates survive the item
 * rules, and the preference scores the solver ranks by. The solver never
 * sees facts; this is where they are used.
 */

export type SolveRole = { id: string; label: string; required: boolean };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Roles to fill: every role a rule names, every role the pack requires,
 * every role the brief mentions by name ("a chair", "monitors"), and any
 * extra roles A2 asked to search for. A role only a preference or the
 * brief names is optional; a hard rule or the pack makes it required.
 */
export function solveRoles(
  requirements: readonly Requirement[],
  packs: readonly Pack[],
  brief: string,
  extra: readonly string[] = [],
): SolveRole[] {
  const hard = new Set<string>();
  const named = new Set<string>(extra);
  for (const r of requirements) {
    for (const role of [r.role, r.pairRole, r.field.split(".")[0] as string]) {
      if (!role) continue;
      named.add(role);
      if (effectiveImportance(r) === "hard") hard.add(role);
    }
  }
  const text = brief.toLowerCase();
  const out: SolveRole[] = [];
  const seen = new Set<string>();
  for (const pack of packs)
    for (const role of pack.roles) {
      if (seen.has(role.role)) continue;
      const words = [role.role.replace(/_/g, " "), role.label.toLowerCase()];
      const mentioned = words.some((w) =>
        new RegExp(`\\b${escapeRe(w)}(?:e?s)?\\b`).test(text),
      );
      const required = role.required === true || hard.has(role.role);
      if (!required && !mentioned && !named.has(role.role)) continue;
      seen.add(role.role);
      out.push({ id: role.role, label: role.label, required });
    }
  // Required first, so a cap drops optional roles before required ones.
  return out
    .sort((a, b) => Number(b.required) - Number(a.required))
    .slice(0, EXHAUSTIVE_MAX_ROLES);
}

export type Screened = {
  offer: Offer;
  role: string;
  /** Hard item rules this offer fails; it never enters the solver when non-empty. */
  fails: string[];
  /** Hard item rules nothing could check yet. */
  unknown: string[];
  /** Preference requirement ID → 1 met, 0.5 unknown, 0 not met. */
  scores: Record<string, number>;
};

/** Item-scope rules for one role, judged on one offer and its facts. */
export function screenOffer(input: {
  role: string;
  offer: Offer;
  facts: readonly Fact[];
  requirements: readonly Requirement[];
  packs: readonly Pack[];
  now: string;
  sources: EvaluationInput["sources"];
}): Screened {
  const requirements = input.requirements.filter(
    (r) => r.scope === "item" && r.role === input.role,
  );
  const results = evaluateResults({
    requirements,
    basket: {
      id: `screen:${input.offer.id}`,
      lines: [{ role: input.role, offerId: input.offer.id, qty: 1 }],
    },
    offers: [input.offer],
    facts: input.facts,
    packs: input.packs,
    now: input.now,
    ...(input.sources ? { sources: input.sources } : {}),
  });
  const fails: string[] = [];
  const unknown: string[] = [];
  const scores: Record<string, number> = {};
  for (const r of results) {
    if (r.importance === "hard") {
      if (r.verdict === "fail") fails.push(r.requirementId);
      if (r.verdict === "unknown") unknown.push(r.requirementId);
    } else {
      scores[r.requirementId] =
        r.verdict === "pass" ? 1 : r.verdict === "unknown" ? 0.5 : 0;
    }
  }
  return { offer: input.offer, role: input.role, fails, unknown, scores };
}

export type ProblemInput = {
  roles: readonly SolveRole[];
  screened: readonly Screened[];
  requirements: readonly Requirement[];
  currency: string;
  merchant: { id: string; shippingMinor: number; taxRateBps: number };
};

/**
 * The solver problem: candidates that pass every hard item rule, at most
 * the exhaustive engine's limit per role (cheapest first), with the basket
 * limits read from the rules. When some candidates for a role pass every
 * hard rule outright, ones with an unchecked rule are left out: a plan
 * should never need a waiver that a proven product would have avoided.
 */
export function toSolverProblem(input: ProblemInput): SolverProblem {
  const candidates: SolverCandidate[] = [];
  for (const role of input.roles) {
    const passing = input.screened.filter(
      (s) => s.role === role.id && s.fails.length === 0,
    );
    const proven = passing.filter((s) => s.unknown.length === 0);
    const pool = (proven.length > 0 ? proven : passing)
      .sort(
        (a, b) =>
          a.unknown.length - b.unknown.length ||
          a.offer.price.amountMinor - b.offer.price.amountMinor,
      )
      .slice(0, EXHAUSTIVE_MAX_CANDIDATES_PER_ROLE);
    for (const s of pool)
      candidates.push({
        id: s.offer.id,
        role: role.id,
        merchant: input.merchant.id,
        unitPriceMinor: s.offer.price.amountMinor,
        ...(s.offer.deliveryBy ? { deliveryBy: s.offer.deliveryBy } : {}),
        scores: s.scores,
      });
  }
  const preferenceWeights: Record<string, number> = {};
  for (const r of input.requirements)
    if (effectiveImportance(r) === "preference" && r.scope === "item")
      preferenceWeights[r.id] = r.weight ?? 0.5;
  const { limits } = limitsFromRequirements(input.requirements, input.currency);
  return {
    currency: input.currency,
    taxRateBps: input.merchant.taxRateBps,
    roles: input.roles.map((r) => ({
      id: r.id,
      ...(r.required ? {} : { optional: true }),
    })),
    merchants: [
      { id: input.merchant.id, shippingMinor: input.merchant.shippingMinor },
    ],
    candidates,
    limits,
    preferenceWeights,
  };
}
