import type { Cut, Selection } from "./evaluate";
import { objectiveOf, totalsOf } from "./evaluate";
import type { Compiled } from "./problem";
import type { BasketLimits, Plan, PlanTradeoff, TradeoffTerm } from "./types";

/** One solve under the given limits and cuts; null when infeasible. */
export type SolveOnce = (
  limits: BasketLimits,
  cuts: readonly Cut[],
) => Selection | null;

/**
 * Plans A, B, C… (SDD §9.1): solve, add a diversity cut against every plan
 * found so far, and solve again, until `k` plans or no more feasible ones.
 */
export function topSelections(
  solve: SolveOnce,
  limits: BasketLimits,
  k: number,
): Selection[] {
  const found: Selection[] = [];
  while (found.length < k) {
    const cuts = found.map((sel): Cut => ({ kind: "diverse", sel }));
    const next = solve(limits, cuts);
    if (!next) break;
    found.push(next);
  }
  return found;
}

export function planLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export function toPlan(p: Compiled, sel: Selection, index: number): Plan {
  const merchants: string[] = [];
  const preferenceScores: Record<string, number> = {};
  for (const id of Object.keys(p.source.preferenceWeights ?? {})) {
    preferenceScores[id] = 0;
  }
  let deliveryLatest: string | null = "";
  const lines = sel.map((i) => {
    const c = p.candidates[i];
    const role = c ? p.roles[c.role] : undefined;
    const source = p.source.candidates[i];
    if (!c || !role || !source) throw new RangeError(`no candidate ${i}`);
    const merchant = p.merchants[c.merchant]?.id ?? source.merchant;
    if (!merchants.includes(merchant)) merchants.push(merchant);
    for (const [id, score] of Object.entries(source.scores ?? {})) {
      preferenceScores[id] = (preferenceScores[id] ?? 0) + score;
    }
    if (deliveryLatest !== null) {
      deliveryLatest =
        c.deliveryBy === null
          ? null
          : c.deliveryBy > deliveryLatest
            ? c.deliveryBy
            : deliveryLatest;
    }
    return { role: role.id, offerId: c.id, qty: role.qty };
  });
  return {
    label: planLabel(index),
    lines,
    merchants,
    totals: totalsOf(p, sel),
    deliveryLatest: deliveryLatest === "" ? null : deliveryLatest,
    preferenceScores,
    objective: objectiveOf(p, sel),
    tradeoff: null,
  };
}

/** Rounds away float noise from score sums before comparing them. */
function clean(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

/**
 * The main tradeoff of `plan` against Plan A, from which preferences,
 * costs and merchant counts differ. Each difference is valued in objective
 * points (w·Δscore, λ·Δtotal, μ·Δmerchants); the largest in each direction
 * is what the plan offers and what it gives up.
 */
export function tradeoffAgainst(
  p: Compiled,
  base: Plan,
  plan: Plan,
): PlanTradeoff {
  const weights = p.source.preferenceWeights ?? {};
  const terms: { term: TradeoffTerm; points: number }[] = [];
  const saves = base.totals.totalMinor - plan.totals.totalMinor;
  if (saves !== 0) {
    terms.push({
      term: { kind: "cost", savesMinor: saves },
      points: p.costPerMinor * saves,
    });
  }
  const ids = new Set([
    ...Object.keys(base.preferenceScores),
    ...Object.keys(plan.preferenceScores),
  ]);
  for (const id of [...ids].sort()) {
    const delta = clean(
      (plan.preferenceScores[id] ?? 0) - (base.preferenceScores[id] ?? 0),
    );
    const points = (weights[id] ?? 0) * delta;
    if (delta !== 0 && points !== 0) {
      terms.push({
        term: { kind: "preference", preferenceId: id, delta },
        points,
      });
    }
  }
  const fewer = base.merchants.length - plan.merchants.length;
  if (fewer !== 0) {
    terms.push({
      term: { kind: "merchants", fewer },
      points: p.perMerchant * fewer,
    });
  }
  let gain: (typeof terms)[number] | null = null;
  let loss: (typeof terms)[number] | null = null;
  for (const t of terms) {
    if (t.points > 0 && (!gain || t.points > gain.points)) gain = t;
    if (t.points < 0 && (!loss || t.points < loss.points)) loss = t;
  }
  return { gain: gain?.term ?? null, loss: loss?.term ?? null };
}

export function buildPlans(
  p: Compiled,
  selections: readonly Selection[],
): Plan[] {
  const plans = selections.map((sel, i) => toPlan(p, sel, i));
  const [base] = plans;
  if (!base) return plans;
  return plans.map((plan, i) =>
    i === 0 ? plan : { ...plan, tradeoff: tradeoffAgainst(p, base, plan) },
  );
}
