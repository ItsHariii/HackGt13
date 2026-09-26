import type { Compiled } from "./problem";
import { deliverable } from "./problem";
import type { BasketLimits, PlanTotals } from "./types";

/**
 * A basket as candidate indexes, one per filled role, in role order. This
 * is the exact ground truth both engines are checked against: totals are
 * integers and tax is rounded half-even, as in `proof-engine`'s `applyRate`.
 */
export type Selection = readonly number[];

/** Tax on merchandise in minor units, rounded half to even. */
export function taxMinor(merchandiseMinor: number, rateBps: number): number {
  const n = BigInt(merchandiseMinor) * BigInt(rateBps);
  const q = n / 10_000n;
  const twice = (n % 10_000n) * 2n;
  const up = twice > 10_000n || (twice === 10_000n && q % 2n === 1n);
  return Number(up ? q + 1n : q);
}

export function totalsOf(p: Compiled, sel: Selection): PlanTotals {
  let merchandiseMinor = 0;
  const used = new Set<number>();
  for (const i of sel) {
    const c = p.candidates[i];
    if (!c) throw new RangeError(`no candidate ${i}`);
    merchandiseMinor += c.lineMinor;
    used.add(c.merchant);
  }
  let shippingMinor = 0;
  for (const k of used) shippingMinor += p.merchants[k]?.shippingMinor ?? 0;
  const tax = taxMinor(merchandiseMinor, p.taxRateBps);
  return {
    currency: p.source.currency,
    merchandiseMinor,
    shippingMinor,
    taxMinor: tax,
    totalMinor: merchandiseMinor + shippingMinor + tax,
  };
}

export function merchantCount(p: Compiled, sel: Selection): number {
  return new Set(sel.map((i) => p.candidates[i]?.merchant)).size;
}

/** Σ w·score − λ·total − μ·merchants, with the exact total. */
export function objectiveOf(p: Compiled, sel: Selection): number {
  let pref = 0;
  for (const i of sel) pref += p.candidates[i]?.prefValue ?? 0;
  return (
    pref -
    p.costPerMinor * totalsOf(p, sel).totalMinor -
    p.perMerchant * merchantCount(p, sel)
  );
}

/** Every hard constraint, checked exactly. */
export function feasible(
  p: Compiled,
  sel: Selection,
  limits: BasketLimits,
): boolean {
  const byRole = new Map<number, number>();
  for (const i of sel) {
    const c = p.candidates[i];
    if (!c || byRole.has(c.role) || !deliverable(c, limits)) return false;
    byRole.set(c.role, i);
  }
  for (const [r, role] of p.roles.entries()) {
    if (!role.optional && !byRole.has(r)) return false;
  }
  const chosen = new Set(sel);
  for (const [a, b] of p.incompatible) {
    if (chosen.has(a) && chosen.has(b)) return false;
  }
  if (limits.maxMerchants && merchantCount(p, sel) > limits.maxMerchants.max) {
    return false;
  }
  if (
    limits.budget &&
    totalsOf(p, sel).totalMinor > limits.budget.maxTotalMinor
  ) {
    return false;
  }
  return true;
}

/**
 * A no-good cut against an earlier selection S.
 * - `diverse` is SDD §9.1's `Σ_{x∈S} x ≤ |S| − 2`: keep at most |S| − 2 of
 *   S's picks, so Plans A, B and C differ in at least two roles. A one-pick
 *   S only needs to change (≤ |S| − 1); an empty S needs any pick at all.
 * - `exclude` removes exactly S and nothing else (`Σ_S x − Σ_{¬S} x ≤ |S| − 1`).
 *   It drops a MILP answer whose exact, rounded total breaks the budget.
 */
export interface Cut {
  kind: "diverse" | "exclude";
  sel: Selection;
}

export function diversityBound(prev: Selection): number {
  return prev.length >= 2 ? prev.length - 2 : prev.length - 1;
}

export function satisfiesCut(sel: Selection, cut: Cut): boolean {
  const keep = new Set(cut.sel);
  const kept = sel.filter((i) => keep.has(i)).length;
  if (cut.kind === "exclude") {
    return kept !== cut.sel.length || sel.length !== cut.sel.length;
  }
  if (cut.sel.length === 0) return sel.length > 0;
  return kept <= diversityBound(cut.sel);
}
