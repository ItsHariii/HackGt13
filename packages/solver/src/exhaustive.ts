import type { Cut, Selection } from "./evaluate";
import { feasible, objectiveOf, satisfiesCut, taxMinor } from "./evaluate";
import type { Compiled } from "./problem";
import { deliverable } from "./problem";
import type { BasketLimits } from "./types";

/** SDD §9.1: the exhaustive engine covers up to 6 roles × 12 candidates. */
export const EXHAUSTIVE_MAX_ROLES = 6;
export const EXHAUSTIVE_MAX_CANDIDATES_PER_ROLE = 12;

export function exhaustiveEligible(p: Compiled): boolean {
  return (
    p.roles.length <= EXHAUSTIVE_MAX_ROLES &&
    p.roles.every(
      (r) => r.candidates.length <= EXHAUSTIVE_MAX_CANDIDATES_PER_ROLE,
    )
  );
}

/**
 * Enumerates every basket and keeps the best exactly-feasible one. It is
 * the reference the MILP is tested against and the fallback when the WASM
 * cannot load. Ties keep the first basket found, in candidate order.
 */
export function solveExhaustive(
  p: Compiled,
  limits: BasketLimits,
  cuts: readonly Cut[],
): Selection | null {
  const options = p.roles.map((role) => {
    const picks: (number | null)[] = role.candidates.filter((i) => {
      const c = p.candidates[i];
      return c !== undefined && deliverable(c, limits);
    });
    if (role.optional) picks.unshift(null);
    return picks;
  });
  if (options.some((o) => o.length === 0)) return null;

  let best: Selection | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  const current: number[] = [];
  const budget = limits.budget?.maxTotalMinor ?? Number.POSITIVE_INFINITY;

  // `merchandise` only grows down the tree, and tax with it, so a partial
  // basket already over budget before shipping can be pruned.
  const visit = (r: number, merchandise: number): void => {
    if (merchandise + taxMinor(merchandise, p.taxRateBps) > budget) return;
    if (r === options.length) {
      if (!feasible(p, current, limits)) return;
      if (!cuts.every((cut) => satisfiesCut(current, cut))) return;
      const value = objectiveOf(p, current);
      if (value > bestValue) {
        bestValue = value;
        best = [...current];
      }
      return;
    }
    for (const pick of options[r] ?? []) {
      if (pick === null) {
        visit(r + 1, merchandise);
        continue;
      }
      if (clashes(p, current, pick)) continue;
      current.push(pick);
      visit(r + 1, merchandise + (p.candidates[pick]?.lineMinor ?? 0));
      current.pop();
    }
  };
  visit(0, 0);
  return best;
}

function clashes(
  p: Compiled,
  chosen: readonly number[],
  pick: number,
): boolean {
  for (const [a, b] of p.incompatible) {
    if (
      (a === pick && chosen.includes(b)) ||
      (b === pick && chosen.includes(a))
    ) {
      return true;
    }
  }
  return false;
}
