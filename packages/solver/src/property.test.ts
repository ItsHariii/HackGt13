import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { feasible } from "./evaluate";
import { solvePlans } from "./index";
import { compile } from "./problem";
import type { SolverCandidate, SolverProblem } from "./types";

/** Objective points; $0.0005 at the default λ. */
const EPSILON = 1e-6;

const DATES = ["2026-09-26", "2026-09-28", "2026-09-30", "2026-10-02"];

/** Small random instances, sized so the exhaustive engine stays instant. */
const instance: fc.Arbitrary<SolverProblem> = fc
  .record({
    roles: fc.array(
      fc.record({
        optional: fc.boolean(),
        qty: fc.integer({ min: 1, max: 3 }),
      }),
      {
        minLength: 1,
        maxLength: 4,
      },
    ),
    shipping: fc.array(fc.integer({ min: 0, max: 3000 }), {
      minLength: 1,
      maxLength: 3,
    }),
    taxRateBps: fc.constantFrom(0, 700, 825, 1000, 5000),
    weights: fc.tuple(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
    ),
    seed: fc.array(
      fc.record({
        role: fc.nat(),
        merchant: fc.nat(),
        price: fc.integer({ min: 50, max: 60_000 }),
        delivery: fc.option(fc.constantFrom(...DATES), { nil: undefined }),
        a: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), {
          nil: undefined,
        }),
        b: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), {
          nil: undefined,
        }),
      }),
      { minLength: 1, maxLength: 16 },
    ),
    pairs: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 4 }),
    budget: fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: undefined }),
    by: fc.option(fc.constantFrom(...DATES), { nil: undefined }),
    maxMerchants: fc.option(fc.integer({ min: 1, max: 2 }), { nil: undefined }),
    costPerDollar: fc.constantFrom(0, 0.002, 0.01),
    perMerchant: fc.constantFrom(0, 0.05),
  })
  .map((g): SolverProblem => {
    const roles = g.roles.map((r, i) => ({ id: `r${i}`, ...r }));
    const merchants = g.shipping.map((s, i) => ({
      id: `m${i}`,
      shippingMinor: s,
    }));
    const candidates = g.seed.map((c, i): SolverCandidate => {
      const scores: Record<string, number> = {};
      if (c.a !== undefined) scores.pa = c.a;
      if (c.b !== undefined) scores.pb = c.b;
      return {
        id: `c${i}`,
        role: `r${c.role % roles.length}`,
        merchant: `m${c.merchant % merchants.length}`,
        unitPriceMinor: c.price,
        ...(c.delivery ? { deliveryBy: c.delivery } : {}),
        scores,
      };
    });
    const incompatible = g.pairs
      .map(([a, b]) => [a % candidates.length, b % candidates.length] as const)
      .filter(([a, b]) => a !== b)
      .map(([a, b]) => [`c${a}`, `c${b}`] as const);
    return {
      currency: "USD",
      taxRateBps: g.taxRateBps,
      roles,
      merchants,
      candidates,
      incompatible,
      preferenceWeights: { pa: g.weights[0], pb: g.weights[1] },
      objective: { costPerDollar: g.costPerDollar, perMerchant: g.perMerchant },
      limits: {
        ...(g.budget !== undefined
          ? { budget: { requirementId: "r_budget", maxTotalMinor: g.budget } }
          : {}),
        ...(g.by
          ? { delivery: { requirementId: "r_delivery", by: g.by } }
          : {}),
        ...(g.maxMerchants
          ? {
              maxMerchants: {
                requirementId: "r_merchants",
                max: g.maxMerchants,
              },
            }
          : {}),
      },
    };
  });

describe("HiGHS agrees with the exhaustive engine (T5.4)", () => {
  it("on random small instances", async () => {
    await fc.assert(
      fc.asyncProperty(instance, async (problem) => {
        const [milp, brute] = await Promise.all([
          solvePlans(problem, { engine: "highs", k: 1 }),
          solvePlans(problem, { engine: "exhaustive", k: 1 }),
        ]);
        expect(milp.status).toBe(brute.status);
        if (milp.status === "infeasible" && brute.status === "infeasible") {
          expect(milp.conflict).toEqual(brute.conflict);
          return;
        }
        if (milp.status !== "optimal" || brute.status !== "optimal") return;
        const [a] = milp.plans;
        const [b] = brute.plans;
        if (!a || !b) throw new Error("optimal result without a plan");
        // HiGHS proves optimality to ~1e-7, so objectives closer than
        // EPSILON are ties. The MILP also linearizes tax with half-down
        // rounding, so at an exact half cent it may value a basket one cent
        // of λ too kindly.
        const slack = (problem.objective?.costPerDollar ?? 0) / 100 + EPSILON;
        expect(a.objective).toBeGreaterThanOrEqual(b.objective - slack);
        expect(a.objective).toBeLessThanOrEqual(b.objective + EPSILON);

        const p = compile(problem);
        const index = new Map(problem.candidates.map((c, i) => [c.id, i]));
        for (const plan of milp.plans) {
          const sel = plan.lines.map((l) => index.get(l.offerId) ?? -1);
          expect(feasible(p, sel, problem.limits ?? {})).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
