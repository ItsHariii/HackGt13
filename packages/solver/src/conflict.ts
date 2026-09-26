import { taxMinor } from "./evaluate";
import type { SolveOnce } from "./plans";
import type { Compiled } from "./problem";
import type {
  BasketLimits,
  ConflictMember,
  ConflictSet,
  LimitKind,
  Relaxation,
} from "./types";

const LIMIT_ORDER: readonly LimitKind[] = [
  "budget",
  "delivery",
  "maxMerchants",
];

function without(
  limits: BasketLimits,
  drop: ReadonlySet<LimitKind>,
): BasketLimits {
  const out: BasketLimits = {};
  if (limits.budget && !drop.has("budget")) out.budget = limits.budget;
  if (limits.delivery && !drop.has("delivery")) out.delivery = limits.delivery;
  if (limits.maxMerchants && !drop.has("maxMerchants"))
    out.maxMerchants = limits.maxMerchants;
  return out;
}

/**
 * The first index in [0, count) whose target is feasible, by bisection.
 * Feasibility must be monotone: once a looser target works, every looser
 * one does too, which holds for all three limits.
 */
function firstFeasible(
  count: number,
  ok: (index: number) => boolean,
): number | null {
  if (count <= 0 || !ok(count - 1)) return null;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function relax(
  p: Compiled,
  solve: SolveOnce,
  limits: BasketLimits,
  kind: LimitKind,
): Relaxation | null {
  const feasibleWith = (patch: BasketLimits) =>
    solve({ ...limits, ...patch }, []) !== null;

  if (kind === "budget" && limits.budget) {
    const b = limits.budget;
    // No basket can cost more than the priciest pick in every role, from
    // every merchant; past that, a bigger budget changes nothing.
    let merchandise = 0;
    for (const role of p.roles) {
      merchandise += Math.max(
        0,
        ...role.candidates.map((i) => p.candidates[i]?.lineMinor ?? 0),
      );
    }
    const shipping = p.merchants.reduce((s, m) => s + m.shippingMinor, 0);
    const ceiling =
      merchandise + shipping + taxMinor(merchandise, p.taxRateBps);
    const from = b.maxTotalMinor + 1;
    const i = firstFeasible(ceiling - from + 1, (n) =>
      feasibleWith({ budget: { ...b, maxTotalMinor: from + n } }),
    );
    return i === null
      ? null
      : {
          kind: "budget",
          toMinor: from + i,
          deltaMinor: from + i - b.maxTotalMinor,
        };
  }

  if (kind === "delivery" && limits.delivery) {
    const d = limits.delivery;
    const dates = [
      ...new Set(
        p.candidates.flatMap((c) =>
          c.deliveryBy !== null && c.deliveryBy > d.by ? [c.deliveryBy] : [],
        ),
      ),
    ].sort();
    const i = firstFeasible(dates.length, (n) =>
      feasibleWith({ delivery: { ...d, by: dates[n] ?? d.by } }),
    );
    return i === null ? null : { kind: "delivery", to: dates[i] ?? d.by };
  }

  if (kind === "maxMerchants" && limits.maxMerchants) {
    const m = limits.maxMerchants;
    const from = m.max + 1;
    const i = firstFeasible(p.merchants.length - from + 1, (n) =>
      feasibleWith({ maxMerchants: { ...m, max: from + n } }),
    );
    return i === null ? null : { kind: "maxMerchants", to: from + i };
  }

  return null;
}

/**
 * SDD §9.2, for an infeasible problem. A deletion filter over the basket
 * limits leaves an irreducible conflict set: drop each limit in turn, and
 * if the rest is still infeasible, the dropped one was not needed. Then,
 * for each member, bisect the smallest relaxation of that limit alone.
 *
 * With no members, the basket limits are not the cause: either a required
 * role has no candidate (`emptyRoles`) or incompatible pairs rule out every
 * combination.
 */
export function findConflict(
  p: Compiled,
  solve: SolveOnce,
  limits: BasketLimits,
): ConflictSet {
  const present = LIMIT_ORDER.filter((k) => limits[k] !== undefined);
  if (solve({}, []) === null) {
    return {
      members: [],
      emptyRoles: p.roles
        .filter((r) => !r.optional && r.candidates.length === 0)
        .map((r) => r.id),
    };
  }

  const dropped = new Set<LimitKind>();
  for (const kind of present) {
    const trial = new Set(dropped).add(kind);
    if (solve(without(limits, trial), []) === null) dropped.add(kind);
  }

  const members: ConflictMember[] = present
    .filter((k) => !dropped.has(k))
    .map((limit) => ({
      limit,
      requirementId: limits[limit]?.requirementId ?? "",
      relaxation: relax(p, solve, limits, limit),
    }));
  return { members, emptyRoles: [] };
}
